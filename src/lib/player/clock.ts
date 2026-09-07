import { useEffect, useState } from "react";
import { getEngine, outputAudio } from "./engine";
import { youtubeDuration, youtubeTime } from "./youtube";
import { usePlayer } from "./store";

export function useAudioClock() {
  const youtube = usePlayer((s) => Boolean(s.tracks[s.index]?.youtubeId));
  const playing = usePlayer((s) => s.playing);
  const [time, setTime] = useState({ current: 0, duration: 0 });

  useEffect(() => {
    const eng = getEngine();
    const els = [eng.audio, eng.bgAudio].filter(Boolean) as HTMLAudioElement[];
    let last = 0;
    const read = () => {
      if (youtube) return { current: youtubeTime(), duration: youtubeDuration() };
      const audio = outputAudio();
      return { current: audio.currentTime || 0, duration: audio.duration || 0 };
    };
    const push = (force = false) => {
      const next = read();
      const now = performance.now();
      if (!force && now - last < 200) return;
      last = now;
      setTime((prev) =>
        Math.abs(prev.current - next.current) < 0.12 && Math.abs(prev.duration - next.duration) < 0.5
          ? prev
          : next,
      );
    };
    const onTime = () => push();
    const onSeeked = () => push(true);
    for (const audio of els) {
      audio.addEventListener("timeupdate", onTime);
      audio.addEventListener("durationchange", onTime);
      audio.addEventListener("seeked", onSeeked);
    }
    const id = playing ? window.setInterval(() => push(), 250) : 0;
    push(true);
    return () => {
      for (const audio of els) {
        audio.removeEventListener("timeupdate", onTime);
        audio.removeEventListener("durationchange", onTime);
        audio.removeEventListener("seeked", onSeeked);
      }
      if (id) window.clearInterval(id);
    };
  }, [youtube, playing]);

  return time;
}