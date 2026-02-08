import { Composition } from 'remotion';
import { ConvertraVSL } from './ConvertraVSL';
import { VIDEO_CONFIG } from './brand';

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
    </>
  );
};
