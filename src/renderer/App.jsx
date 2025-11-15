import { Canvas } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Grid, OrbitControls, TransformControls } from '@react-three/drei';
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

  return (
    <div className="workspace">
      <header className="workspace__header">
        <div>
          <p className="eyebrow">CAD3D Playground</p>
          <h1>Primitive Composer</h1>
        </div>
        <div className="header__actions">
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
          </div>
          <ModelingViewport
            primitives={primitives}
            selectedId={selectedId}
            onSelectPrimitive={setSelectedId}
            handleMode={handleMode}
            onTransformPrimitive={handleTransformPrimitive}
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

function ModelingViewport({ primitives, selectedId, onSelectPrimitive, handleMode, onTransformPrimitive }) {
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
        <CombinedSolid primitives={primitives} />
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
    </Canvas>
  );
}

function EditablePrimitive({ primitive, isSelected, handleMode, onSelect, onTransform, orbitControlsRef }) {
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

function CombinedSolid({ primitives }) {
  const mesh = useMemo(() => buildCombinedMesh(primitives), [primitives]);
  if (!mesh) return null;
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

const PrimitiveGhost = forwardRef(function PrimitiveGhost({ primitive, onPointerDown, isSelected }, ref) {
  const { type, position, dimensions, operation } = primitive;
  const isSubtract = operation === 'subtract';
  const worldPosition = positionToWorld(position);
  const sharedProps = {
    position: [worldPosition.x, worldPosition.y, worldPosition.z],
    onPointerDown,
  };

  const color = isSubtract ? '#ff4d6d' : '#26d07c';
  const opacity = isSelected ? 0.3 : 0.18;
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
