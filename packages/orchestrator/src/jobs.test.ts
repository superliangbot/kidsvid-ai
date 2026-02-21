import { describe, it, expect } from 'vitest';
import { JOB_NAMES, PIPELINE_STAGES } from './jobs.js';

describe('JOB_NAMES', () => {
  it('defines all pipeline job types', () => {
    expect(JOB_NAMES.ANALYZE).toBe('analyze');
    expect(JOB_NAMES.GENERATE_SCRIPT).toBe('generate-script');
    expect(JOB_NAMES.GENERATE_MEDIA).toBe('generate-media');
    expect(JOB_NAMES.QUALITY_CHECK).toBe('quality-check');
    expect(JOB_NAMES.REVIEW).toBe('review');
    expect(JOB_NAMES.PUBLISH).toBe('publish');
    expect(JOB_NAMES.TRACK).toBe('track-performance');
    expect(JOB_NAMES.REPORT).toBe('weekly-report');
    expect(JOB_NAMES.SCORE).toBe('score-strategies');
  });

  it('has 9 job types', () => {
    expect(Object.keys(JOB_NAMES)).toHaveLength(9);
  });
});

describe('PIPELINE_STAGES', () => {
  it('defines correct pipeline order', () => {
    expect(PIPELINE_STAGES[0]).toBe('analyze');
    expect(PIPELINE_STAGES[1]).toBe('generate-script');
    expect(PIPELINE_STAGES[2]).toBe('generate-media');
    expect(PIPELINE_STAGES[3]).toBe('quality-check');
    expect(PIPELINE_STAGES[4]).toBe('review');
    expect(PIPELINE_STAGES[5]).toBe('publish');
    expect(PIPELINE_STAGES[6]).toBe('track-performance');
  });

  it('has 7 stages in the main pipeline', () => {
    expect(PIPELINE_STAGES).toHaveLength(7);
  });

  it('starts with analyze and ends with track', () => {
    expect(PIPELINE_STAGES[0]).toBe('analyze');
    expect(PIPELINE_STAGES[PIPELINE_STAGES.length - 1]).toBe('track-performance');
  });
});
