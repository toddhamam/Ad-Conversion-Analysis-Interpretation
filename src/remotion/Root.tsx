import { Composition, registerRoot } from 'remotion';
import { ConvertraVSL } from './ConvertraVSL';
import { DemoVideo } from './DemoVideo';
import { VIDEO_CONFIG, DEMO_VIDEO_CONFIG } from './brand';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ConvertraVSL"
        component={ConvertraVSL}
        durationInFrames={VIDEO_CONFIG.durationInFrames}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
      />
      <Composition
        id="DemoVideo"
        component={DemoVideo}
        durationInFrames={DEMO_VIDEO_CONFIG.durationInFrames}
        fps={DEMO_VIDEO_CONFIG.fps}
        width={DEMO_VIDEO_CONFIG.width}
        height={DEMO_VIDEO_CONFIG.height}
      />
    </>
  );
};

registerRoot(RemotionRoot);
