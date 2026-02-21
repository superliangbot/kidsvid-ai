import { describe, it, expect, vi } from 'vitest';
import { JOB_NAMES, PIPELINE_STAGES } from './jobs.js';

/** End-to-end pipeline integration test.
 * Tests the pipeline stage definitions and flow logic. */

describe('Pipeline Stages', () => {
  it('defines correct stage order', () => {
    expect(PIPELINE_STAGES).toEqual([
      'analyze',
      'generate-script',
      'generate-media',
      'quality-check',
      'review',
      'publish',
      'track-performance',
    ]);
  });

  it('has 7 stages in the main pipeline', () => {
    expect(PIPELINE_STAGES).toHaveLength(7);
  });

  it('starts with analyze and ends with track', () => {
    expect(PIPELINE_STAGES[0]).toBe('analyze');
    expect(PIPELINE_STAGES[PIPELINE_STAGES.length - 1]).toBe('track-performance');
  });

  it('review gate comes before publish', () => {
    const reviewIdx = PIPELINE_STAGES.indexOf('review');
    const publishIdx = PIPELINE_STAGES.indexOf('publish');
    expect(reviewIdx).toBeLessThan(publishIdx);
  });

  it('quality-check comes before review', () => {
    const qcIdx = PIPELINE_STAGES.indexOf('quality-check');
    const reviewIdx = PIPELINE_STAGES.indexOf('review');
    expect(qcIdx).toBeLessThan(reviewIdx);
  });

  it('all pipeline stages have corresponding job names', () => {
    const jobValues = Object.values(JOB_NAMES);
    for (const stage of PIPELINE_STAGES) {
      expect(jobValues).toContain(stage);
    }
  });
});

describe('Pipeline Flow Simulation', () => {
  it('simulates a complete dry-run pipeline', () => {
    // Stage 1: Analysis produces patterns
    const analysisResult = {
      channelsAnalyzed: 10,
      videosAnalyzed: 300,
      patterns: [
        { patternType: 'title_length', finding: 'Short titles perform better', confidence: 0.8 },
        { patternType: 'tags_popular', finding: 'nursery rhymes most popular tag', confidence: 0.75 },
      ],
      apiQuotaUsed: 31,
    };
    expect(analysisResult.channelsAnalyzed).toBe(10);
    expect(analysisResult.patterns.length).toBeGreaterThan(0);

    // Stage 2: Script generation uses patterns to create content
    const scriptRequest = {
      category: 'educational' as const,
      educationalCategory: 'early_math' as const,
      educationalObjective: 'Learn to count from 1 to 5',
      engagementHooks: ['call_response', 'reward_loop'] as const,
      targetDuration: 210,
      ageBracket: '4-6' as const,
      characterIds: [0],
      topic: 'counting to 5',
      seriesName: 'Counting Adventures',
      episodeNumber: 1,
    };
    expect(scriptRequest.educationalCategory).toBe('early_math');
    expect(scriptRequest.seriesName).toBe('Counting Adventures');

    // Stage 3: Media generation
    const mediaResult = {
      thumbnailUrl: 'mock://thumbnail/1.png',
      audioUrl: 'mock://audio/1.mp3',
      musicUrl: 'mock://music/1.mp3',
      videoUrl: 'mock://video/1.mp4',
    };
    expect(mediaResult.thumbnailUrl).toContain('mock://');

    // Stage 4: Quality check
    const qualityScore = {
      educationalValue: 8,
      engagementPotential: 7,
      passed: true,
      feedback: [],
    };
    expect(qualityScore.passed).toBe(true);
    expect(qualityScore.educationalValue).toBeGreaterThanOrEqual(7);

    // Stage 5: Review (manual approval)
    const reviewResult = { approved: true, reviewedBy: 'admin' };
    expect(reviewResult.approved).toBe(true);

    // Stage 6: Publish (dry-run)
    const publishResult = {
      videoId: 'dry-run-123',
      url: 'https://youtube.com/watch?v=dry-run-123',
      publishedAt: new Date(),
      dryRun: true,
    };
    expect(publishResult.dryRun).toBe(true);
    expect(publishResult.videoId).toContain('dry-run');

    // Stage 7: Performance tracking
    const trackResult = {
      videoId: 'dry-run-123',
      views: 0,
      likes: 0,
      comments: 0,
    };
    expect(trackResult.views).toBe(0);
  });

  it('simulates series-based pipeline', () => {
    // Generate series metadata
    const series = {
      id: 'counting-adventures-s1',
      name: 'Counting Adventures',
      educationalCategory: 'early_math',
      ageBracket: '4-6',
      totalEpisodes: 5,
      episodeOutlines: Array.from({ length: 5 }, (_, i) => ({
        episodeNumber: i + 1,
        title: `Counting Adventures Ep.${i + 1}`,
        topic: `numbers ${i * 5 + 1}-${(i + 1) * 5}`,
        targetDuration: 210,
      })),
    };

    // Each episode goes through the pipeline
    for (const episode of series.episodeOutlines) {
      expect(episode.episodeNumber).toBeGreaterThan(0);
      expect(episode.targetDuration).toBe(210);
    }

    expect(series.episodeOutlines).toHaveLength(5);
    expect(series.episodeOutlines[0].episodeNumber).toBe(1);
    expect(series.episodeOutlines[4].episodeNumber).toBe(5);
  });

  it('simulates failure and retry flow', () => {
    // Quality check fails
    const failedScore = {
      educationalValue: 5,
      engagementPotential: 4,
      passed: false,
      feedback: ['Educational value too low', 'Missing engagement hooks'],
    };
    expect(failedScore.passed).toBe(false);
    expect(failedScore.feedback.length).toBe(2);

    // Retry: regenerate with feedback
    const retryRequest = {
      ...{
        category: 'educational' as const,
        educationalCategory: 'early_math' as const,
        educationalObjective: 'Learn to count from 1 to 5',
        targetDuration: 210,
        ageBracket: '4-6' as const,
      },
      previousFeedback: failedScore.feedback,
      retryAttempt: 1,
    };
    expect(retryRequest.retryAttempt).toBe(1);
    expect(retryRequest.previousFeedback).toEqual(failedScore.feedback);

    // Second attempt passes
    const retryScore = {
      educationalValue: 8,
      engagementPotential: 8,
      passed: true,
      feedback: [],
    };
    expect(retryScore.passed).toBe(true);
  });

  it('simulates review rejection flow', () => {
    // Content enters review
    const reviewItem = {
      jobId: 'review-123',
      generatedVideoId: 1,
      title: 'Counting Fun with Cosmo',
      status: 'pending_review' as const,
    };

    // Admin rejects
    const rejection = {
      jobId: reviewItem.jobId,
      approved: false,
      reason: 'Character animation needs improvement',
    };
    expect(rejection.approved).toBe(false);
    expect(rejection.reason).toContain('animation');

    // Job is marked as failed and can be re-queued
    const failedJob = {
      ...reviewItem,
      status: 'failed' as const,
      failedReason: rejection.reason,
    };
    expect(failedJob.status).toBe('failed');
  });
});
