import React, { useState, useRef } from "react";
import ReactCrop, { Crop, PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { X } from "lucide-react";

interface CroppedImageUploadProps {
  label: string;
  required?: boolean;
  value?: File | null;
  onChange: (file: File | undefined) => void;
}

export function CroppedImageUpload({
  label,
  required = false,
  value,
  onChange,
}: CroppedImageUploadProps) {
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>({
    unit: "%",
    width: 90,
    height: 90,
    x: 5,
    y: 5,
  });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [openCrop, setOpenCrop] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setTempImage(reader.result as string);
      setOpenCrop(true);
    };
    reader.readAsDataURL(file);
  };

  const getCroppedBlob = async (image: HTMLImageElement, crop: PixelCrop) => {
    const canvas = document.createElement("canvas");
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = crop.width;
    canvas.height = crop.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(
      image,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      crop.width,
      crop.height
    );

    return new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => resolve(blob as Blob), "image/jpeg", 0.95);
    });
  };

  const applyCrop = async () => {
    if (!completedCrop || !imgRef.current) return;

    const blob = await getCroppedBlob(imgRef.current, completedCrop);
    const file = new File([blob!], "cropped.jpg", { type: "image/jpeg" });

    onChange(file);
    setPreview(URL.createObjectURL(file));
    setOpenCrop(false);
    setTempImage(null);
  };

  const removeImage = () => {
    setPreview(null);
    onChange(undefined);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {/* Preview Box */}
      {preview ? (
        <div className="relative w-32">
          <img src={preview} className="w-32 h-32 rounded-lg object-cover" />

          <button
            className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full"
            onClick={removeImage}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <label className="w-32 h-32 flex flex-col items-center justify-center 
          border-2 border-dashed rounded-lg cursor-pointer text-gray-500">
          <span>Upload</span>
          <input type="file" accept="image/*" className="hidden" onChange={onSelectFile} />
        </label>
      )}

      {/* CROP MODAL */}
      {openCrop && tempImage && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg max-w-xl w-full">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
            >
              <img ref={imgRef} src={tempImage} />
            </ReactCrop>

            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setOpenCrop(false)}>Cancel</button>
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded"
                onClick={applyCrop}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
