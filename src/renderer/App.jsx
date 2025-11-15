import { Canvas } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Grid, Html, Line, OrbitControls, TransformControls } from '@react-three/drei';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { CSG } from 'three-csg-ts';
import * as THREE from 'three';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_PRIMITIVES = [
  {
    id: 'prim-1',
    name: 'Base Plate',
    type: 'box',
    operation: 'add',
    position: { x: 0, y: 0, z: 0.5 },
    dimensions: { width: 6, height: 1, depth: 6 },
  },
  {
    id: 'prim-2',
    name: 'Center Column',
    type: 'cylinder',
    operation: 'add',
    position: { x: 0, y: 0, z: 2.5 },
    dimensions: { radius: 1.2, height: 4 },
  },
  {
    id: 'prim-3',
    name: 'Corner Scoop',
    type: 'sphere',
    operation: 'subtract',
    position: { x: 2.5, y: 2.5, z: 1.5 },
    dimensions: { radius: 1.4 },
  },
];

const TYPE_PRESETS = {
  box: {
    label: 'Box',
    dimensions: { width: 2, height: 2, depth: 2 },
  },
  sphere: {
    label: 'Sphere',
    dimensions: { radius: 1.5 },
  },
  cylinder: {
    label: 'Cylinder',
    dimensions: { radius: 1.1, height: 3 },
  },
};

const randomId = () => `prim-${Math.random().toString(36).slice(2, 9)}`;

const parseNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundValue = (value, precision = 2) => {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
};

const HANDLE_MODES = {
  move: 'move',
  resize: 'resize',
};

const KEY_STEP = 0.25;

const positionToWorld = ({ x, y, z }) => ({
  x,
  y: z,
  z: y,
});

const positionFromWorld = ({ x, y, z }) => ({
  x,
  y: z,
  z: y,
});

export default function App() {
  const [primitives, setPrimitives] = useState(DEFAULT_PRIMITIVES);
  const [selectedId, setSelectedId] = useState(DEFAULT_PRIMITIVES[0]?.id ?? null);
  const [handleMode, setHandleMode] = useState(HANDLE_MODES.move);
  const [showOrigin, setShowOrigin] = useState(true);
  const [ghostOpacity, setGhostOpacity] = useState(0.8);

  const selectedPrimitive = primitives.find((primitive) => primitive.id === selectedId) ?? null;

  const patchPrimitive = useCallback((id, updater) => {
    setPrimitives((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        return typeof updater === 'function' ? updater(item) : { ...item, ...updater };
      })
    );
  }, []);

  const addPrimitive = useCallback((type) => {
    const preset = TYPE_PRESETS[type];
    const newPrimitive = {
      id: randomId(),
      name: `${preset.label} ${Math.floor(Math.random() * 90 + 10)}`,
      type,
      operation: type === 'sphere' ? 'subtract' : 'add',
      position: {
        x: 0,
        y: 0,
        z: preset.dimensions.height ? preset.dimensions.height / 2 : preset.dimensions.radius,
      },
      dimensions: { ...preset.dimensions },
    };

    setPrimitives((items) => [...items, newPrimitive]);
    setSelectedId(newPrimitive.id);
  }, []);

  const handleTransformPrimitive = useCallback(
    (id, payload) => {
      patchPrimitive(id, (current) => ({
        ...current,
        ...(payload.position ? { position: { ...payload.position } } : {}),
        ...(payload.dimensions ? { dimensions: { ...payload.dimensions } } : {}),
      }));
    },
    [patchPrimitive]
  );

  const removePrimitive = useCallback((id) => {
    setPrimitives((items) => {
      const filtered = items.filter((item) => item.id !== id);
      setSelectedId((current) => {
        if (!filtered.length) return null;
        if (current === id || !filtered.some((item) => item.id === current)) {
          return filtered[filtered.length - 1].id;
        }
        return current;
      });
      return filtered;
    });
  }, []);

  const reorderPrimitive = useCallback((id, direction) => {
    setPrimitives((items) => {
      const index = items.findIndex((primitive) => primitive.id === id);
      if (index === -1) return items;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= items.length) return items;

      const nextItems = [...items];
      const [moved] = nextItems.splice(index, 1);
      nextItems.splice(targetIndex, 0, moved);
      return nextItems;
    });
  }, []);

  const exportToSTL = useCallback(() => {
    const mesh = buildCombinedMesh(primitives);
    if (!mesh) return;

    const exporter = new STLExporter();
    const stl = exporter.parse(mesh);
    const blob = new Blob([stl], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cad3d-object-${Date.now()}.stl`;
    document.body.appendChild(link);
    link.click();
    requestAnimationFrame(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }, [primitives]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!selectedId) return;
      if (document.activeElement) {
        const tag = document.activeElement.tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || document.activeElement.isContentEditable) {
          return;
        }
      }

      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!arrowKeys.includes(event.key)) return;

      event.preventDefault();

      const step = event.shiftKey ? KEY_STEP * 2 : KEY_STEP;
      const deltas = { x: 0, y: 0, z: 0 };
      if (event.key === 'ArrowUp') deltas.z = step;
      if (event.key === 'ArrowDown') deltas.z = -step;
      if (event.key === 'ArrowLeft') deltas.x = -step;
      if (event.key === 'ArrowRight') deltas.x = step;

      patchPrimitive(selectedId, (current) => ({
        ...current,
        position: {
          ...current.position,
          x: roundValue(current.position.x + deltas.x),
          y: roundValue(current.position.y + deltas.y),
          z: roundValue(current.position.z + deltas.z),
        },
      }));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, patchPrimitive]);

  return (
    <div className="workspace">
      <header className="workspace__header">
        <div>
          <p className="eyebrow">CAD3D Playground</p>
          <h1>Primitive Composer</h1>
        </div>
        <div className="header__actions">
          <div className="header__actions-group">
            {Object.keys(TYPE_PRESETS).map((type) => (
              <button
                key={type}
                type="button"
                className="btn btn--ghost"
                onClick={() => addPrimitive(type)}
              >
                Add {TYPE_PRESETS[type].label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--primary" onClick={exportToSTL} disabled={!primitives.length}>
            Export STL
          </button>
        </div>
      </header>

      <section className="workspace__body">
        <aside className="panel panel--list">
          <div className="panel__title">
            <div>
              <h2>Primitives</h2>
              <p>Shapes combine from top to bottom. Z axis controls height; subtract shapes carve material.</p>
            </div>
          </div>

          <ul className="primitive-list">
            {primitives.map((primitive, index) => (
              <li key={primitive.id}>
                <button
                  type="button"
                  className={`primitive ${primitive.id === selectedId ? 'primitive--active' : ''}`}
                  onClick={() => setSelectedId(primitive.id)}
                >
                  <span className={`primitive__operation primitive__operation--${primitive.operation}`}>
                    {primitive.operation === 'subtract' ? '-' : '+'}
                  </span>
                  <div className="primitive__detail">
                    <strong>{primitive.name}</strong>
                    <small>
                      {TYPE_PRESETS[primitive.type].label} / {primitive.operation === 'subtract' ? 'Subtract' : 'Add'}
                    </small>
                  </div>
                  <span className="primitive__index">#{index + 1}</span>
                </button>
                <div className="primitive__controls">
                  <button type="button" onClick={() => reorderPrimitive(primitive.id, -1)} disabled={index === 0}>
                    Up
                  </button>
                  <button type="button" onClick={() => reorderPrimitive(primitive.id, 1)} disabled={index === primitives.length - 1}>
                    Dn
                  </button>
                  <button type="button" onClick={() => removePrimitive(primitive.id)}>
                    Del
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <div className="viewport">
          <div className="viewport__toolbar">
            <div className="viewport__toggles">
              <div className="handle-toggle">
                {[
                  { label: 'Move', value: HANDLE_MODES.move },
                  { label: 'Resize', value: HANDLE_MODES.resize },
                ].map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    className={`handle-toggle__btn ${handleMode === mode.value ? 'is-active' : ''}`}
                    onClick={() => setHandleMode(mode.value)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`btn btn--ghost btn--tiny ${showOrigin ? 'is-active' : ''}`}
                onClick={() => setShowOrigin((value) => !value)}
              >
                {showOrigin ? 'Hide' : 'Show'} Origin
              </button>
              <label className="opacity-slider">
                <span>Ghost Opacity</span>
                <input
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.05"
                  value={ghostOpacity}
                  onChange={(event) => setGhostOpacity(parseNumber(event.target.value, ghostOpacity))}
                />
              </label>
            </div>
          </div>
          <ModelingViewport
            primitives={primitives}
            selectedId={selectedId}
            onSelectPrimitive={setSelectedId}
            handleMode={handleMode}
            onTransformPrimitive={handleTransformPrimitive}
            showOrigin={showOrigin}
            ghostOpacity={ghostOpacity}
          />
          {!primitives.length && (
            <div className="viewport__empty">
              <p>No primitives yet</p>
              <span>Add a box, sphere, or cylinder to get started.</span>
            </div>
          )}
        </div>

        <aside className="panel panel--details">
          <h2>Inspector</h2>
          {selectedPrimitive ? (
            <PrimitiveInspector primitive={selectedPrimitive} onChange={patchPrimitive} />
          ) : (
            <div className="inspector__empty">
              <p>Select a primitive to edit its dimensions, operation, and placement.</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function ModelingViewport({
  primitives,
  selectedId,
  onSelectPrimitive,
  handleMode,
  onTransformPrimitive,
  showOrigin,
  ghostOpacity,
}) {
  const orbitControlsRef = useRef(null);
  const handleDeselect = useCallback(() => {
    onSelectPrimitive(null);
  }, [onSelectPrimitive]);

  return (
    <Canvas shadows camera={{ position: [10, 8, 10], fov: 45 }} onPointerMissed={handleDeselect}>
      <color attach="background" args={['#05070d']} />
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[5, 10, 3]}
        intensity={0.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <pointLight position={[-8, 6, -6]} intensity={0.35} color="#82cfff" />
      <group>
          <CombinedSolid primitives={primitives} ghostOpacity={ghostOpacity} />
        <group>
          {primitives.map((primitive) => (
            <EditablePrimitive
              key={primitive.id}
              primitive={primitive}
              isSelected={primitive.id === selectedId}
              handleMode={handleMode}
              onSelect={onSelectPrimitive}
              onTransform={onTransformPrimitive}
              orbitControlsRef={orbitControlsRef}
              ghostOpacity={ghostOpacity}
            />
          ))}
        </group>
      </group>
      <Grid cellSize={0.5} infiniteGrid sectionThickness={1.25} sectionColor="#172338" fadeDistance={50} />
      <OrbitControls
        ref={orbitControlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.1}
        maxPolarAngle={Math.PI / 2.1}
      />
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={['#ff5370', '#48c0b5', '#82aaff']}
          labelColor="#e3f2fd"
          labels={['X', 'Z', 'Y']}
        />
      </GizmoHelper>
      {showOrigin && <OriginIndicator />}
    </Canvas>
  );
}

function EditablePrimitive({
  primitive,
  isSelected,
  handleMode,
  onSelect,
  onTransform,
  orbitControlsRef,
  ghostOpacity,
}) {
  const meshRef = useRef(null);
  const controlsRef = useRef(null);
  const sessionRef = useRef(null);

  useEffect(() => {
    if (!controlsRef.current || !orbitControlsRef?.current) return undefined;
    const controls = controlsRef.current;
    const orbit = orbitControlsRef.current;
    const toggleOrbit = (event) => {
      orbit.enabled = !event.value;
    };
    controls.addEventListener('dragging-changed', toggleOrbit);
    return () => {
      controls.removeEventListener('dragging-changed', toggleOrbit);
    };
  }, [orbitControlsRef, isSelected, handleMode]);

  useEffect(() => {
    if (!controlsRef.current || !meshRef.current || !isSelected) return undefined;
    controlsRef.current.attach(meshRef.current);
    return () => {
      controlsRef.current?.detach();
    };
  }, [isSelected, primitive]);

  const handlePointerDown = (event) => {
    event.stopPropagation();
    onSelect(primitive.id);
  };

  const baseMesh = (
    <PrimitiveGhost
      ref={meshRef}
      primitive={primitive}
      onPointerDown={handlePointerDown}
      isSelected={isSelected}
      ghostOpacity={ghostOpacity}
    />
  );

  if (!isSelected) {
    return baseMesh;
  }

  const mode = handleMode === HANDLE_MODES.resize ? 'scale' : 'translate';

  const finalizeResize = () => {
    if (mode !== 'scale' || !meshRef.current || !sessionRef.current) return;
    const nextDimensions = computeScaledDimensions(primitive.type, sessionRef.current.startDimensions, meshRef.current.scale);
    if (nextDimensions) {
      onTransform(primitive.id, { dimensions: nextDimensions });
    }
    meshRef.current.scale.set(1, 1, 1);
  };

  const finalizeTranslate = () => {
    if (mode !== 'translate' || !meshRef.current) return;
    const { x, y, z } = meshRef.current.position;
    const userPosition = positionFromWorld({
      x: roundValue(x),
      y: roundValue(y),
      z: roundValue(z),
    });
    onTransform(primitive.id, { position: userPosition });
  };

  return (
    <>
      <TransformControls
        ref={controlsRef}
        mode={mode}
        showX
        showY
        showZ
        size={handleMode === HANDLE_MODES.move ? 1 : 0.9}
        onMouseDown={() => {
          if (mode === 'scale') {
            sessionRef.current = { startDimensions: { ...primitive.dimensions } };
          }
        }}
        onMouseUp={() => {
          finalizeResize();
          finalizeTranslate();
          sessionRef.current = null;
        }}
      >
        {baseMesh}
      </TransformControls>
      {handleMode === HANDLE_MODES.resize ? (
        <DimensionIndicators primitive={primitive} onChange={onTransform} />
      ) : (
        <DistanceFromOriginIndicators primitive={primitive} onChange={onTransform} />
      )}
    </>
  );
}

function PrimitiveInspector({ primitive, onChange }) {
  const { id, name, type, operation, position, dimensions } = primitive;

  const setValue = (mutator) => {
    onChange(id, (current) => mutator(current));
  };

  const handleDimensionsChange = (dimensionKey, value) => {
    setValue((current) => ({
      ...current,
      dimensions: { ...current.dimensions, [dimensionKey]: value },
    }));
  };

  return (
    <form className="inspector">
      <label>
        Label
        <input
          type="text"
          value={name}
          onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))}
        />
      </label>

      <label>
        Type
        <select
          value={type}
          onChange={(event) => {
            const nextType = event.target.value;
            setValue((current) => ({
              ...current,
              type: nextType,
              dimensions: { ...TYPE_PRESETS[nextType].dimensions },
            }));
          }}
        >
          {Object.entries(TYPE_PRESETS).map(([key, preset]) => (
            <option key={key} value={key}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Operation
        <select
          value={operation}
          onChange={(event) =>
            setValue((current) => ({
              ...current,
              operation: event.target.value,
            }))
          }
        >
          <option value="add">Add (Union)</option>
          <option value="subtract">Subtract (Cut)</option>
        </select>
      </label>

      <fieldset>
        <legend>Position</legend>
        <div className="vector-inputs">
          {['x', 'y', 'z'].map((axis) => (
            <label key={axis}>
              {axis === 'z' ? 'Z (Up)' : axis.toUpperCase()}
              <input
                type="number"
                value={position[axis]}
                step="0.25"
                onChange={(event) =>
                  setValue((current) => ({
                    ...current,
                    position: {
                      ...current.position,
                      [axis]: parseNumber(event.target.value, current.position[axis]),
                    },
                  }))
                }
              />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Dimensions</legend>
        <div className="vector-inputs">
          {type === 'box' && (
            <>
              <label>
                Width
                <input
                  type="number"
                  step="0.25"
                  value={dimensions.width}
                  onChange={(event) => handleDimensionsChange('width', parseNumber(event.target.value, dimensions.width))}
                />
              </label>
              <label>
                Height
                <input
                  type="number"
                  step="0.25"
                  value={dimensions.height}
                  onChange={(event) =>
                    handleDimensionsChange('height', parseNumber(event.target.value, dimensions.height))
                  }
                />
              </label>
              <label>
                Depth
                <input
                  type="number"
                  step="0.25"
                  value={dimensions.depth}
                  onChange={(event) => handleDimensionsChange('depth', parseNumber(event.target.value, dimensions.depth))}
                />
              </label>
            </>
          )}

          {type === 'sphere' && (
            <label>
              Radius
              <input
                type="number"
                step="0.1"
                value={dimensions.radius}
                onChange={(event) =>
                  handleDimensionsChange('radius', Math.max(0.1, parseNumber(event.target.value, dimensions.radius)))
                }
              />
            </label>
          )}

          {type === 'cylinder' && (
            <>
              <label>
                Radius
                <input
                  type="number"
                  step="0.1"
                  value={dimensions.radius}
                  onChange={(event) =>
                    handleDimensionsChange('radius', Math.max(0.1, parseNumber(event.target.value, dimensions.radius)))
                  }
                />
              </label>
              <label>
                Height
                <input
                  type="number"
                  step="0.1"
                  value={dimensions.height}
                  onChange={(event) =>
                    handleDimensionsChange('height', Math.max(0.1, parseNumber(event.target.value, dimensions.height)))
                  }
                />
              </label>
            </>
          )}
        </div>
      </fieldset>
    </form>
  );
}

function CombinedSolid({ primitives, ghostOpacity }) {
  const mesh = useMemo(() => buildCombinedMesh(primitives), [primitives]);
  if (!mesh) return null;

  const solidOpacity = Math.min(1, Math.max(ghostOpacity + 0.25, 0.25));
  if (mesh.material) {
    mesh.material.opacity = solidOpacity;
    mesh.material.transparent = solidOpacity < 0.99;
    mesh.material.needsUpdate = true;
  }

  return <primitive object={mesh} />;
}

function buildCombinedMesh(primitives) {
  if (!primitives.length) return null;

  let merged = CSG.fromMesh(primitiveToMesh(primitives[0]));

  for (let i = 1; i < primitives.length; i += 1) {
    const primitive = primitives[i];
    const mesh = primitiveToMesh(primitive);
    const next = CSG.fromMesh(mesh);
    merged = primitive.operation === 'subtract' ? merged.subtract(next) : merged.union(next);
  }

  const material = new THREE.MeshStandardMaterial({
    color: '#ffb347',
    roughness: 0.55,
    metalness: 0.15,
  });

  const mesh = CSG.toMesh(merged, new THREE.Matrix4(), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function primitiveToMesh(primitive) {
  const { type, position, dimensions } = primitive;
  let geometry;

  if (type === 'box') {
    geometry = new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth);
  } else if (type === 'sphere') {
    geometry = new THREE.SphereGeometry(dimensions.radius, 48, 32);
  } else {
    geometry = new THREE.CylinderGeometry(dimensions.radius, dimensions.radius, dimensions.height, 48);
  }

  const mesh = new THREE.Mesh(geometry);
  const worldPosition = positionToWorld(position);
  mesh.position.set(worldPosition.x, worldPosition.y, worldPosition.z);
  mesh.updateMatrix();
  return mesh;
}

const clampDimension = (value, fallback = 0.1) => Math.max(fallback, Number.isFinite(value) ? value : fallback);

function computeScaledDimensions(type, baseDimensions, scale) {
  if (!scale) return null;
  if (type === 'box') {
    return {
      width: roundValue(clampDimension(baseDimensions.width * Math.abs(scale.x))),
      height: roundValue(clampDimension(baseDimensions.height * Math.abs(scale.y))),
      depth: roundValue(clampDimension(baseDimensions.depth * Math.abs(scale.z))),
    };
  }

  if (type === 'sphere') {
    const uniformScale = (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3;
    return {
      radius: roundValue(clampDimension(baseDimensions.radius * uniformScale)),
    };
  }

  const radialScale = (Math.abs(scale.x) + Math.abs(scale.z)) / 2;
  return {
    radius: roundValue(clampDimension(baseDimensions.radius * radialScale)),
    height: roundValue(clampDimension(baseDimensions.height * Math.abs(scale.y))),
  };
}

const PrimitiveGhost = forwardRef(function PrimitiveGhost({ primitive, onPointerDown, isSelected, ghostOpacity }, ref) {
  const { type, position, dimensions, operation } = primitive;
  const isSubtract = operation === 'subtract';
  const worldPosition = positionToWorld(position);
  const sharedProps = {
    position: [worldPosition.x, worldPosition.y, worldPosition.z],
    onPointerDown,
  };

  const color = isSubtract ? '#ff4d6d' : '#26d07c';
  const opacity = isSelected ? Math.min(ghostOpacity + 0.1, 1) : 0;
  const wireframe = !isSelected;

  if (type === 'box') {
    return (
      <mesh {...sharedProps} ref={ref}>
        <boxGeometry args={[dimensions.width, dimensions.height, dimensions.depth]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} wireframe={wireframe} />
      </mesh>
    );
  }

  if (type === 'sphere') {
    return (
      <mesh {...sharedProps} ref={ref}>
        <sphereGeometry args={[dimensions.radius, 32, 16]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} wireframe={wireframe} />
      </mesh>
    );
  }

  return (
    <mesh {...sharedProps} ref={ref}>
      <cylinderGeometry args={[dimensions.radius, dimensions.radius, dimensions.height, 32]} />
      <meshStandardMaterial color={color} transparent opacity={opacity} wireframe={wireframe} />
    </mesh>
  );
});

function DimensionIndicators({ primitive, onChange }) {
  const { type, dimensions, position } = primitive;
  const worldPosition = positionToWorld(position);
  const arrows = [];

  const updateDimensions = (nextDimensions) => {
    onChange(primitive.id, {
      dimensions: {
        ...primitive.dimensions,
        ...nextDimensions,
      },
    });
  };

  const clampSize = (value, min = 0.1) => roundValue(Math.max(min, parseNumber(value, 0)));

  if (type === 'box') {
    const halfWidth = dimensions.width / 2;
    const halfDepth = dimensions.depth / 2;
    const halfHeight = dimensions.height / 2;
    const topY = worldPosition.y + halfHeight;
    const bottomY = worldPosition.y - halfHeight;

    const widthOffsetZ = worldPosition.z + halfDepth + 0.6;
    const depthOffsetX = worldPosition.x + halfWidth + 0.6;
    const heightOffsetX = worldPosition.x - halfWidth - 0.6;
    const heightOffsetZ = worldPosition.z - halfDepth - 0.4;

    arrows.push(
      <DimensionArrow
        key="box-width"
        label="Width (X)"
        value={roundValue(dimensions.width)}
        start={[worldPosition.x - halfWidth, topY + 0.2, widthOffsetZ]}
        end={[worldPosition.x + halfWidth, topY + 0.2, widthOffsetZ]}
        onCommit={(value) => updateDimensions({ width: clampSize(value) })}
      />
    );

    arrows.push(
      <DimensionArrow
        key="box-depth"
        label="Depth (Y)"
        value={roundValue(dimensions.depth)}
        start={[depthOffsetX, topY + 0.2, worldPosition.z - halfDepth]}
        end={[depthOffsetX, topY + 0.2, worldPosition.z + halfDepth]}
        onCommit={(value) => updateDimensions({ depth: clampSize(value) })}
      />
    );

    arrows.push(
      <DimensionArrow
        key="box-height"
        label="Height (Z)"
        value={roundValue(dimensions.height)}
        start={[heightOffsetX, bottomY, heightOffsetZ]}
        end={[heightOffsetX, topY, heightOffsetZ]}
        onCommit={(value) => updateDimensions({ height: clampSize(value) })}
      />
    );
  }

  if (type === 'sphere') {
    const radius = dimensions.radius;
    const diameter = roundValue(radius * 2);
    const offsetX = worldPosition.x + radius + 0.8;
    arrows.push(
      <DimensionArrow
        key="sphere-diameter"
        label="Diameter"
        value={diameter}
        start={[offsetX, worldPosition.y - radius, worldPosition.z]}
        end={[offsetX, worldPosition.y + radius, worldPosition.z]}
        onCommit={(value) => updateDimensions({ radius: clampSize(value, 0.2) / 2 })}
      />
    );
  }

  if (type === 'cylinder') {
    const halfHeight = dimensions.height / 2;
    const radius = dimensions.radius;
    const diameter = roundValue(radius * 2);
    const topY = worldPosition.y + halfHeight;
    const bottomY = worldPosition.y - halfHeight;

    const diameterOffsetY = topY + 0.3;

    arrows.push(
      <DimensionArrow
        key="cylinder-height"
        label="Height (Z)"
        value={roundValue(dimensions.height)}
        start={[worldPosition.x + radius + 0.7, bottomY, worldPosition.z]}
        end={[worldPosition.x + radius + 0.7, topY, worldPosition.z]}
        onCommit={(value) => updateDimensions({ height: clampSize(value) })}
      />
    );

    arrows.push(
      <DimensionArrow
        key="cylinder-diameter"
        label="Diameter"
        value={diameter}
        start={[worldPosition.x - radius, diameterOffsetY, worldPosition.z]}
        end={[worldPosition.x + radius, diameterOffsetY, worldPosition.z]}
        onCommit={(value) => updateDimensions({ radius: clampSize(value, 0.2) / 2 })}
      />
    );
  }

  return <group>{arrows}</group>;
}

function DistanceFromOriginIndicators({ primitive, onChange }) {
  const worldPosition = positionToWorld(primitive.position);
  const axes = [
    {
      key: 'dist-x',
      label: 'X',
      color: '#ff5370',
      start: [0, 0.02, 0],
      end: [worldPosition.x, 0.02, 0],
      value: roundValue(primitive.position.x),
      unit: [1, 0, 0],
      axisKey: 'x',
    },
    {
      key: 'dist-y',
      label: 'Y',
      color: '#82aaff',
      start: [0, 0.02, 0],
      end: [0, 0.02, worldPosition.z],
      value: roundValue(primitive.position.y),
      unit: [0, 0, 1],
      axisKey: 'y',
    },
    {
      key: 'dist-z',
      label: 'Z',
      color: '#48c0b5',
      start: [0, 0, 0],
      end: [0, worldPosition.y, 0],
      value: roundValue(primitive.position.z),
      unit: [0, 1, 0],
      axisKey: 'z',
    },
  ];

  const updatePosition = useCallback(
    (axisKey, nextValue) => {
      onChange(primitive.id, {
        position: {
          ...primitive.position,
          [axisKey]: roundValue(nextValue),
        },
      });
    },
    [primitive, onChange]
  );

  return (
    <group>
      {axes.map((axis) => (
        <DistanceAxisIndicator
          key={axis.key}
          axis={axis}
          onCommit={(value) => updatePosition(axis.axisKey, value)}
        />
      ))}
    </group>
  );
}

function DistanceAxisIndicator({ axis, onCommit }) {
  const startVec = new THREE.Vector3(...axis.start);
  const endVec = new THREE.Vector3(...axis.end);
  const delta = endVec.clone().sub(startVec);
  const hasMagnitude = delta.length() > 0.001;
  const actualEndVector = hasMagnitude
    ? endVec
    : startVec.clone().add(new THREE.Vector3(...axis.unit).multiplyScalar(0.001));
  const actualEnd = actualEndVector.toArray();
  const direction = actualEndVector.clone().sub(startVec).normalize();
  const midpoint = startVec.clone().add(actualEndVector).multiplyScalar(0.5).toArray();

  return (
    <group>
      <Line
        points={[axis.start, actualEnd]}
        color={axis.color}
        lineWidth={1}
        dashed
        depthTest={false}
        renderOrder={11}
      />
      <ArrowHead position={actualEnd} direction={direction} alwaysOnTop color={axis.color} />
      <DistanceValueLabel label={axis.label} value={axis.value} onCommit={onCommit} position={midpoint} />
    </group>
  );
}

function DistanceValueLabel({ label, value, onCommit, position }) {
  const [draft, setDraft] = useState(String(value));
  const [isEditing, setEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleChange = (event) => {
    const nextValue = event.target.value;
    setDraft(nextValue);
    onCommit(parseNumber(nextValue, value));
  };

  const handleBlur = () => {
    setEditing(false);
  };

  return (
    <Html
      position={position}
      center
      className={`dimension-label distance-label ${isEditing ? 'dimension-label--editing' : ''}`}
      distanceFactor={14}
    >
      <span className="distance-label__axis">{label}</span>
      {isEditing ? (
        <input
          ref={inputRef}
          type="number"
          step="0.1"
          value={draft}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              setDraft(String(value));
              setEditing(false);
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {value}
        </button>
      )}
    </Html>
  );
}

function DimensionArrow({ start, end, label, value, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  const [isEditing, setEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startVec = useMemo(() => new THREE.Vector3(...start), [start]);
  const endVec = useMemo(() => new THREE.Vector3(...end), [end]);
  const direction = useMemo(() => endVec.clone().sub(startVec).normalize(), [startVec, endVec]);
  const midpoint = useMemo(() => startVec.clone().add(endVec).multiplyScalar(0.5).toArray(), [startVec, endVec]);

  const commitValue = () => {
    onCommit(parseNumber(draft, value));
  };

  const handleBlur = () => {
    commitValue();
    setEditing(false);
  };

  const handleChange = (event) => {
    const nextValue = event.target.value;
    setDraft(nextValue);
    onCommit(parseNumber(nextValue, value));
  };

  return (
    <group>
      <Line points={[start, end]} color="#f9c76b" lineWidth={1} dashed dashSize={0.2} gapSize={0.1} />
      <ArrowHead position={start} direction={direction} invert />
      <ArrowHead position={end} direction={direction} />
      <Html
        position={midpoint}
        center
        className={`dimension-label ${isEditing ? 'dimension-label--editing' : ''}`}
        distanceFactor={14}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="number"
            step="0.1"
            value={draft}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitValue();
              } else if (event.key === 'Escape') {
                setDraft(String(value));
                setEditing(false);
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {value}
          </button>
        )}
      </Html>
    </group>
  );
}

function ArrowHead({ position, direction, invert = false, alwaysOnTop = false, color = '#f9c76b' }) {
  const quaternion = useMemo(() => {
    const target = direction.clone().multiplyScalar(invert ? -1 : 1).normalize();
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), target);
    return quat;
  }, [direction, invert]);

  return (
    <mesh position={position} quaternion={quaternion} renderOrder={alwaysOnTop ? 10 : 0}>
      <coneGeometry args={[0.07, 0.25, 16]} />
      <meshStandardMaterial color={color} depthTest={!alwaysOnTop} depthWrite={!alwaysOnTop} />
    </mesh>
  );
}

function OriginIndicator() {
  const axisLength = 2.5;
  const axes = [
    { label: 'X', color: '#ff5370', dir: [axisLength, 0, 0] },
    { label: 'Z', color: '#48c0b5', dir: [0, axisLength, 0] },
    { label: 'Y', color: '#82aaff', dir: [0, 0, axisLength] },
  ];

  return (
    <group>
      {axes.map((axis) => (
        <AxisArrow key={axis.label} axis={axis} />
      ))}
      <mesh>
        <sphereGeometry args={[0.08, 24, 24]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

function AxisArrow({ axis }) {
  const tip = axis.dir;
  const points = useMemo(
    () => [
      [0, 0, 0],
      tip,
    ],
    [tip]
  );

  const direction = useMemo(() => new THREE.Vector3(...tip).normalize(), [tip]);

  return (
    <group>
      <Line points={points} color={axis.color} lineWidth={2} depthTest={false} renderOrder={10} />
      <ArrowHead position={tip} direction={direction} alwaysOnTop color={axis.color} />
      <Html position={tip} center className="dimension-label dimension-label--static" distanceFactor={18}>
        {axis.label}
      </Html>
    </group>
  );
}
