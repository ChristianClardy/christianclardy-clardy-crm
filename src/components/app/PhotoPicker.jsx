import { useRef } from "react";
import { Camera, Images, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Two ways to add photos: the camera, or photos already on the phone / computer.
// A single input with capture="environment" would force the camera and hide
// the photo library, so each button gets its own input.
export default function PhotoPicker({ onFiles, busy = false, disabled = false, cameraLabel = "Take photo", libraryLabel = "Choose from library", size = "sm" }) {
  const cameraRef = useRef();
  const libraryRef = useRef();
  const pick = (e) => {
    const files = e.target.files;
    if (files?.length) onFiles(files);
    e.target.value = "";
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size={size} variant="outline" onClick={() => cameraRef.current?.click()} disabled={disabled || busy}>
        {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Camera className="w-4 h-4 mr-1" />}
        {busy ? "Uploading…" : cameraLabel}
      </Button>
      <Button type="button" size={size} variant="outline" onClick={() => libraryRef.current?.click()} disabled={disabled || busy}>
        <Images className="w-4 h-4 mr-1" /> {libraryLabel}
      </Button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={pick} />
    </div>
  );
}
