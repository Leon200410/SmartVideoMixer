[OPEN] video-filter-failure

# Debug Session

## Symptom

- Generate video fails with: `ffmpeg exited with code 1`
- FFmpeg stderr includes:
  - `Error reinitializing filters!`
  - `Failed to inject frame into filter network: Invalid argument`
  - `Error while processing the decoded data for stream #13:0`

## Hypotheses

1. One concatenated input stream has a width/height or pixel format mismatch, causing a downstream filter graph reinit failure.
2. A generated intro/outro/remotion clip differs in fps, SAR/DAR, or time base from segment clips, and the xfade/filter chain rejects it mid-graph.
3. A segment selected by the template engine has invalid trim timing or zero/near-zero duration, which breaks one branch of the filter graph.
4. The generated filter_complex string references the wrong stream index after optional inputs are added, so FFmpeg applies a video filter to an incompatible stream.
5. A rotation/scaling/setsar normalization path is missing for one input type, and FFmpeg fails only when that specific stream reaches filter input `#13:0`.

## Plan

1. Inspect the generation pipeline and identify the exact FFmpeg command / filter graph assembly points.
2. Add minimal runtime instrumentation around segment selection, generated inputs, and final FFmpeg arguments.
3. Reproduce the failure and collect evidence.
4. Implement the smallest fix supported by the captured logs.

## Evidence

- `docker logs smartvideomixer-backend` captured the exact FFmpeg command from the failed generation.
- Pure video reproduction with the same 7 inputs failed with:
  - `First input link main timebase (1/90000) do not match the corresponding second input link xfade timebase (1/15360)`
  - `Error while processing the decoded data for stream #6:0`
- `ffprobe` on the latest generated inputs showed:
  - Intro clip: `r_frame_rate=30/1`, `pix_fmt=yuvj420p`, audio `aac 48000Hz stereo`
  - Styled clips: `r_frame_rate=30/1`, `pix_fmt=yuv420p`
- Minimal validation with `settb=AVTB` inserted before every `xfade` succeeded on the exact same input files.

## Hypothesis Status

1. Input stream width/height or pixel-format mismatch causes the failure: INCONCLUSIVE.
   Evidence: intro pix_fmt differs (`yuvj420p` vs `yuv420p`), but adding only `settb=AVTB` fixed the reproduction.
2. Intro/outro clip parameters differ from segment clips and break `xfade`: CONFIRMED.
   Evidence: intro clip timebase differs from styled clips; FFmpeg reported an explicit xfade timebase mismatch.
3. Invalid segment duration causes the filter graph to fail: REJECTED.
   Evidence: all selected segments are ~7.47s or 7.50s, well above the 0.22s transition duration.
4. Stream index mapping is wrong: REJECTED.
   Evidence: the logged command's input indices match the expected graph; reproducing only the video chain still fails.
5. Background music input is corrupted or is the root cause: REJECTED.
   Evidence: isolated audio reproduction with looped `upbeat.mp3` passed; pure video reproduction still failed.
