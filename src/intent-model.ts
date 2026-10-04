import model from './models/tourism-intent-model.ts';

export type TourismIntent = typeof model.labels[number];
export type IntentPrediction = { label: TourismIntent; score: number };

function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function features(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) ?? [];
  const result = words.map((word) => `w:${word}`);
  result.push(...words.slice(0, -1).map((word, index) => `b:${word}::${words[index + 1]}`));
  for (const word of words) {
    const padded = `^${word}$`;
    for (const size of model.featureSpec.characterNgrams) {
      for (let index = 0; index <= padded.length - size; index += 1) {
        result.push(`c:${padded.slice(index, index + size)}`);
      }
    }
  }
  return result;
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function classifyTourismIntents(text: string): IntentPrediction[] {
  const counts = new Map<number, number>();
  for (const feature of features(text)) {
    const index = fnv1a(feature) % model.featureSpec.dimensions;
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  const norm = Math.sqrt([...counts.values()].reduce((sum, count) => sum + count * count, 0)) || 1;
  return model.labels.flatMap((label, labelIndex) => {
    let logit = model.bias[labelIndex]!;
    const weights = model.weights[labelIndex]!;
    for (const [index, count] of counts) logit += weights[index]! * count / norm;
    const score = sigmoid(logit);
    return score >= model.thresholds[labelIndex]! ? [{ label, score }] : [];
  }).sort((left, right) => right.score - left.score);
}

export const intentModelMetadata = {
  name: model.name,
  version: model.version,
  trainingExamples: model.trainingData.examples,
  featureSpec: model.featureSpec,
  validation: model.validation,
};
