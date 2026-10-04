import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTourismIntents, intentModelMetadata } from '../src/intent-model.ts';

test('trained model detects unseen tourism phrasing', () => {
  const labels = classifyTourismIntents('Could someone collect us at Ondera Market?').map((item) => item.label);
  assert.ok(labels.includes('transport'));
});

test('trained model supports multiple intents', () => {
  const labels = classifyTourismIntents('Can we pay cash if heavy rain stops the visit?').map((item) => item.label);
  assert.ok(labels.includes('payment'));
  assert.ok(labels.includes('weather'));
});

test('second round handles noisy free text', () => {
  const labels = classifyTourismIntents('Pls snd the map pin, our txi driver cnt find the frm').map((item) => item.label);
  assert.ok(labels.includes('location'));
  assert.ok(labels.includes('transport'));
});

test('model metadata records second-round training and hard audit', () => {
  assert.ok(intentModelMetadata.trainingExamples >= 19000);
  assert.ok(intentModelMetadata.validation.micro_f1 >= 0.8);
  assert.equal(intentModelMetadata.version, 2);
});
