export type SpatialPreset = "off" | "room" | "cinema" | "overhead";

type Bed = {
  delay: DelayNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: PannerNode;
  channel: 0 | 1 | "mid";
};

export type SpatialGraph = {
  input: GainNode;
  splitter: ChannelSplitterNode;
  midL: GainNode;
  midR: GainNode;
  dry: GainNode;
  wet: GainNode;
  output: GainNode;
  beds: Bed[];
  preset: SpatialPreset;
  amount: number;
};

function setPos(panner: PannerNode, x: number, y: number, z: number) {
  if (panner.positionX) {
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
  } else {
    panner.setPosition(x, y, z);
  }
}

function place(panner: PannerNode, azimuth: number, elevation: number, distance = 1.15) {
  const az = (azimuth * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  setPos(
    panner,
    Math.sin(az) * Math.cos(el) * distance,
    Math.sin(el) * distance,
    -Math.cos(az) * Math.cos(el) * distance,
  );
}

function makeBed(ctx: AudioContext, channel: Bed["channel"]): Bed {
  const delay = ctx.createDelay(0.08);
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const panner = ctx.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 1;
  panner.maxDistance = 8;
  panner.rolloffFactor = 1;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
  return { delay, filter, gain, panner, channel };
}

function layout(preset: SpatialPreset) {
  if (preset === "overhead") {
    return {
      dry: 0.42,
      beds: [
        { ch: 0 as const, az: -28, el: 8, delay: 0.001, type: "highshelf" as const, freq: 2500, gainDb: 2, level: 0.7 },
        { ch: 1 as const, az: 28, el: 8, delay: 0.0014, type: "highshelf" as const, freq: 2500, gainDb: 2, level: 0.7 },
        { ch: 0 as const, az: -22, el: 62, delay: 0.007, type: "highpass" as const, freq: 1600, gainDb: 0, level: 0.55 },
        { ch: 1 as const, az: 22, el: 62, delay: 0.01, type: "highpass" as const, freq: 1600, gainDb: 0, level: 0.55 },
        { ch: "mid" as const, az: 0, el: 78, delay: 0.012, type: "highpass" as const, freq: 2800, gainDb: 0, level: 0.38 },
        { ch: 0 as const, az: -125, el: 18, delay: 0.018, type: "lowpass" as const, freq: 5200, gainDb: 0, level: 0.28 },
        { ch: 1 as const, az: 125, el: 18, delay: 0.022, type: "lowpass" as const, freq: 5200, gainDb: 0, level: 0.28 },
      ],
    };
  }
  if (preset === "room") {
    return {
      dry: 0.62,
      beds: [
        { ch: 0 as const, az: -32, el: 0, delay: 0.0008, type: "peaking" as const, freq: 4000, gainDb: 1.5, level: 0.72 },
        { ch: 1 as const, az: 32, el: 0, delay: 0.0012, type: "peaking" as const, freq: 4000, gainDb: 1.5, level: 0.72 },
        { ch: 0 as const, az: -20, el: 42, delay: 0.006, type: "highpass" as const, freq: 1800, gainDb: 0, level: 0.32 },
        { ch: 1 as const, az: 20, el: 42, delay: 0.008, type: "highpass" as const, freq: 1800, gainDb: 0, level: 0.32 },
        { ch: 0 as const, az: -110, el: 6, delay: 0.014, type: "lowpass" as const, freq: 4500, gainDb: 0, level: 0.22 },
        { ch: 1 as const, az: 110, el: 6, delay: 0.017, type: "lowpass" as const, freq: 4500, gainDb: 0, level: 0.22 },
      ],
    };
  }
  return {
    dry: 0.5,
    beds: [
      { ch: 0 as const, az: -30, el: 2, delay: 0.001, type: "highshelf" as const, freq: 6000, gainDb: 1.5, level: 0.78 },
      { ch: 1 as const, az: 30, el: 2, delay: 0.0015, type: "highshelf" as const, freq: 6000, gainDb: 1.5, level: 0.78 },
      { ch: "mid" as const, az: 0, el: 0, delay: 0.0004, type: "lowpass" as const, freq: 8000, gainDb: 0, level: 0.28 },
      { ch: 0 as const, az: -25, el: 52, delay: 0.007, type: "highpass" as const, freq: 1700, gainDb: 0, level: 0.42 },
      { ch: 1 as const, az: 25, el: 52, delay: 0.01, type: "highpass" as const, freq: 1700, gainDb: 0, level: 0.42 },
      { ch: 0 as const, az: -120, el: 8, delay: 0.016, type: "lowpass" as const, freq: 4800, gainDb: 0, level: 0.32 },
      { ch: 1 as const, az: 120, el: 8, delay: 0.021, type: "lowpass" as const, freq: 4800, gainDb: 0, level: 0.32 },
    ],
  };
}

export function createSpatial(ctx: AudioContext): SpatialGraph {
  const listener = ctx.listener;
  if (listener.forwardZ) {
    listener.positionX.value = 0;
    listener.positionY.value = 0;
    listener.positionZ.value = 0;
    listener.forwardX.value = 0;
    listener.forwardY.value = 0;
    listener.forwardZ.value = -1;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  } else {
    listener.setOrientation(0, 0, -1, 0, 1, 0);
    listener.setPosition(0, 0, 0);
  }

  const input = ctx.createGain();
  const splitter = ctx.createChannelSplitter(2);
  const midL = ctx.createGain();
  const midR = ctx.createGain();
  midL.gain.value = 0.5;
  midR.gain.value = 0.5;
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const output = ctx.createGain();
  const beds = Array.from({ length: 7 }, () => makeBed(ctx, 0));
  return {
    input,
    splitter,
    midL,
    midR,
    dry,
    wet,
    output,
    beds,
    preset: "off",
    amount: 0.7,
  };
}

function safeDisconnect(node: AudioNode) {
  try {
    node.disconnect();
  } catch {
    /* */
  }
}

export function spatialNodes(graph: SpatialGraph): AudioNode[] {
  return [
    graph.input,
    graph.splitter,
    graph.midL,
    graph.midR,
    graph.dry,
    graph.wet,
    graph.output,
    ...graph.beds.flatMap((bed) => [bed.delay, bed.filter, bed.gain, bed.panner]),
  ];
}

export function disconnectSpatial(graph: SpatialGraph) {
  for (const node of spatialNodes(graph)) safeDisconnect(node);
}

export function wireSpatial(graph: SpatialGraph, from: AudioNode, to: AudioNode) {
  disconnectSpatial(graph);
  from.connect(graph.input);
  graph.output.connect(to);

  if (graph.preset === "off") {
    graph.input.connect(graph.output);
    return;
  }

  const plan = layout(graph.preset);
  const amount = Math.max(0, Math.min(1, graph.amount));
  graph.dry.gain.value = plan.dry + (1 - amount) * (1 - plan.dry);
  graph.wet.gain.value = amount;
  graph.input.connect(graph.dry);
  graph.dry.connect(graph.output);
  graph.input.connect(graph.splitter);
  graph.splitter.connect(graph.midL, 0);
  graph.splitter.connect(graph.midR, 1);
  graph.wet.connect(graph.output);

  plan.beds.forEach((spec, i) => {
    const bed = graph.beds[i];
    if (!bed) return;
    bed.channel = spec.ch;
    bed.delay.delayTime.value = spec.delay;
    bed.filter.type = spec.type;
    bed.filter.frequency.value = spec.freq;
    bed.filter.gain.value = spec.gainDb;
    bed.gain.gain.value = spec.level;
    place(bed.panner, spec.az, spec.el);
    if (spec.ch === "mid") {
      graph.midL.connect(bed.delay);
      graph.midR.connect(bed.delay);
    } else {
      graph.splitter.connect(bed.delay, spec.ch);
    }
    bed.delay.connect(bed.filter);
    bed.filter.connect(bed.gain);
    bed.gain.connect(bed.panner);
    bed.panner.connect(graph.wet);
  });
}

export function setSpatial(graph: SpatialGraph, preset: SpatialPreset, amount: number) {
  graph.preset = preset;
  graph.amount = amount;
}
