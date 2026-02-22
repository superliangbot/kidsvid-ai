import { Composition } from "remotion";
import { CountingVideo } from "./CountingVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CountingVideo"
      component={CountingVideo}
      durationInFrames={3600} // placeholder, will be overridden by calculateMetadata
      fps={30}
      width={1280}
      height={720}
    />
  );
};
