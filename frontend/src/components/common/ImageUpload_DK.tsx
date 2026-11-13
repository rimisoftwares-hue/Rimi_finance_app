import React, { useCallback, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, X, Camera, Check, RotateCw, ZoomIn, ZoomOut,
  FolderOpen, RefreshCw, FlipHorizontal, Crop as CropIcon, Image as ImageIcon
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../lib/utils';
import { usePermissionFlow } from '../../hooks/usePermissionFlow';
import { PermissionModal } from './PermissionModal';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop, convertToPixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

export interface ImageUploadProps {
  label: string;
  required?: boolean;
  accept?: string;
  multiple?: boolean;
  value?: File | File[] | string | null;
  onChange: (files: File | File[] | undefined | null) => void;
  className?: string;
  enableCrop?: boolean;
  aspectRatio?: number;
  error?: string;
  existingUrl?: string;
  enableCamera?: boolean;
}

// Canvas preview helper
function canvasPreview(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  crop: PixelCrop,
  rotation: number = 0,
  zoom: number = 1,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  canvas.width = Math.floor(crop.width);
  canvas.height = Math.floor(crop.height);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(zoom, zoom);

  ctx.drawImage(
    image,
    Math.floor(crop.x * scaleX),
    Math.floor(crop.y * scaleY),
    Math.floor(crop.width * scaleX),
    Math.floor(crop.height * scaleY),
    -canvas.width / 2,
    -canvas.height / 2,
    canvas.width,
    canvas.height
  );

  ctx.restore();
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect?: number): Crop {
  if (!aspect || aspect <= 0) {
    return { unit: '%', width: 80, height: 80, x: 10, y: 10 };
  }
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 80 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight,
  );
}

export function ImageUpload({
  label,
  required = false,
  accept = "image/*",
  multiple = false,
  value,
  onChange,
  className,
  enableCrop = true,
  aspectRatio = 1, // 1:1 default, can be 4/3, 3/4, or undefined
  error,
  existingUrl,
  enableCamera = false,
}: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>('image.jpg');
  const [originalMimeType, setOriginalMimeType] = useState<string>('image/jpeg');

  // Permission flow
  const cameraFlow = usePermissionFlow('camera');

  // Camera state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Crop controls
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    width: 80,
    height: 80,
    x: 10,
    y: 10,
  });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);

  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasSnapRef = useRef<HTMLCanvasElement>(null);

  // Cleanup media stream on unmount
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [stream]);

  // ─── Camera controls ────────────────────────────────────────────────────────
  const stopStream = useCallback(() => {
    setStream(prev => {
      prev?.getTracks().forEach(t => t.stop());
      return null;
    });
    setIsCameraReady(false);
  }, []);

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    stopStream();
    setIsCameraReady(false);
    setCameraError(null);

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setCameraError('Camera is not supported on this device/browser.');
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(mediaStream);

      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().then(() => setIsCameraReady(true)).catch(() => setIsCameraReady(true));
          };
        }
      });
    } catch (err: any) {
      const msg =
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in browser permissions.'
          : err.name === 'NotFoundError'
            ? 'No camera found on this device.'
            : `Camera unavailable: ${err.message || 'Error accessing camera'}`;
      setCameraError(msg);
    }
  }, [stopStream]);

  const openCameraUI = useCallback(() => {
    setCameraOpen(true);
    setTimeout(() => startCamera(facingMode), 100);
  }, [facingMode, startCamera]);

  const handleCameraClick = useCallback(async () => {
    const r = await cameraFlow.ensure();
    if (r.granted) {
      openCameraUI();
    }
  }, [cameraFlow, openCameraUI]);

  const closeCamera = useCallback(() => {
    stopStream();
    setCameraOpen(false);
    setCameraError(null);
  }, [stopStream]);

  const flipCamera = useCallback(() => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startCamera(next);
  }, [facingMode, startCamera]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasSnapRef.current) return;
    const video = videoRef.current;
    const canvas = canvasSnapRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    stopStream();
    setCameraOpen(false);
    const fileName = `camera-photo-${Date.now()}.jpg`;
    setOriginalFileName(fileName);
    setOriginalMimeType('image/jpeg');

    if (enableCrop) {
      setTempImage(dataUrl);
      setCropOpen(true);
      setRotation(0);
      setZoom(1);
    } else {
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], fileName, { type: 'image/jpeg' });
          if (multiple) {
            const currentList = Array.isArray(value) ? value : [];
            onChange([...currentList, file]);
          } else {
            onChange(file);
          }
        }
      }, 'image/jpeg', 0.95);
    }
  }, [stopStream, enableCrop, multiple, value, onChange]);

  // ─── File selection ─────────────────────────────────────────────────────────
  const handleFileSelect = useCallback((files: File[]) => {
    if (files.length === 0) return;

    if (multiple) {
      const currentList = Array.isArray(value) ? value : [];
      onChange([...currentList, ...files]);
    } else {
      const file = files[0];
      setOriginalFileName(file.name);
      setOriginalMimeType(file.type || 'image/jpeg');

      if (enableCrop) {
        const reader = new FileReader();
        reader.onload = () => {
          setTempImage(reader.result as string);
          setCropOpen(true);
          setRotation(0);
          setZoom(1);
        };
        reader.readAsDataURL(file);
      } else {
        onChange(file);
      }
    }
  }, [multiple, enableCrop, value, onChange]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files || []);
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
  }, [handleFileSelect]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileSelect(files);
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [handleFileSelect]);

  // Open crop for currently displayed image
  const handleOpenCropForCurrent = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (value instanceof File) {
      const reader = new FileReader();
      reader.onload = () => {
        setTempImage(reader.result as string);
        setCropOpen(true);
        setRotation(0);
        setZoom(1);
      };
      reader.readAsDataURL(value);
    } else if (typeof value === 'string' && value.trim()) {
      setTempImage(value);
      setCropOpen(true);
      setRotation(0);
      setZoom(1);
    } else if (existingUrl) {
      setTempImage(existingUrl);
      setCropOpen(true);
      setRotation(0);
      setZoom(1);
    }
  }, [value, existingUrl]);

  // ─── Apply crop ─────────────────────────────────────────────────────────────
  const applyCrop = useCallback(async () => {
    if (!imgRef.current || !previewCanvasRef.current) return;

    try {
      let cropToUse = completedCrop;
      if (!cropToUse || !cropToUse.width || !cropToUse.height) {
        const { width, height } = imgRef.current;
        const initialCrop = centerAspectCrop(width, height, aspectRatio);
        cropToUse = convertToPixelCrop(initialCrop, width, height);
      }
      if (!cropToUse) return;

      canvasPreview(imgRef.current, previewCanvasRef.current, cropToUse, rotation, zoom);

      const canvas = previewCanvasRef.current;
      const mime = originalMimeType.includes('png') ? 'image/png' : 'image/jpeg';
      const ext = mime === 'image/png' ? '.png' : '.jpg';
      const baseName = (originalFileName || 'cropped-image').replace(/\.[^/.]+$/, '');
      const fileName = `${baseName}${ext}`;

      canvas.toBlob((blob) => {
        if (blob) {
          const croppedFile = new File([blob], fileName, {
            type: mime,
          });
          if (multiple) {
            const currentList = Array.isArray(value) ? value : [];
            onChange([...currentList, croppedFile]);
          } else {
            onChange(croppedFile);
          }
          setCropOpen(false);
          setTempImage(null);
        }
      }, mime, 0.95);
    } catch (err) {
      console.error('Error cropping image:', err);
    }
  }, [completedCrop, originalFileName, originalMimeType, onChange, multiple, value, rotation, zoom, aspectRatio]);

  const cancelCrop = useCallback(() => {
    setCropOpen(false);
    setTempImage(null);
    setRotation(0);
    setZoom(1);
  }, []);

  const removeFile = useCallback((index?: number) => {
    if (multiple && Array.isArray(value)) {
      if (typeof index === 'number') {
        const newFiles = value.filter((_, i) => i !== index);
        onChange(newFiles.length > 0 ? newFiles : undefined);
      } else {
        onChange(undefined);
      }
    } else {
      onChange(undefined);
    }
  }, [multiple, value, onChange]);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerAspectCrop(width, height, aspectRatio);
    setCrop(initialCrop);
    setCompletedCrop(convertToPixelCrop(initialCrop, width, height));
  }, [aspectRatio]);

  useEffect(() => {
    if (completedCrop?.width && completedCrop?.height && imgRef.current && previewCanvasRef.current) {
      canvasPreview(
        imgRef.current,
        previewCanvasRef.current,
        completedCrop,
        rotation,
        zoom,
      );
    }
  }, [completedCrop, rotation, zoom]);

  const hasValue = Boolean(
    (value && (!Array.isArray(value) || value.length > 0)) || existingUrl
  );

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
        {value instanceof File && (
          <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">
            {value.name}
          </span>
        )}
      </div>

      <div
        className={cn(
          'relative flex flex-col items-center justify-center w-full min-h-[128px] max-h-[170px] border-2 border-dashed rounded-xl transition-all duration-200 overflow-hidden bg-muted/20',
          dragActive
            ? "border-primary bg-primary/10"
            : hasValue
              ? "border-border"
              : "border-border hover:border-primary/50",
          error && "border-destructive/60 bg-destructive/5"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Hidden canvas for taking snapshot from camera */}
        <canvas ref={canvasSnapRef} className="hidden" />

        {!hasValue ? (
          <div className="flex flex-col items-center justify-center p-3 text-center space-y-2 w-full h-full">
            {/* Buttons: Camera & Browse options */}
            <div className="flex items-center gap-2 w-full max-w-xs">
              {enableCamera && (
                <button
                  type="button"
                  onClick={handleCameraClick}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium shadow-sm transition-all active:scale-95"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Camera
                </button>
              )}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-medium border border-border shadow-sm transition-all active:scale-95",
                  enableCamera
                    ? "flex-1 bg-background hover:bg-muted/60 text-foreground"
                    : "w-full bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Browse File
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Click buttons or drag & drop (JPG, PNG, WEBP — Max 5MB)
            </p>
          </div>
        ) : (
          <div className="relative w-full h-full min-h-[128px] flex items-center justify-center p-2 bg-background/50">
            {multiple && Array.isArray(value) ? (
              <div className="grid grid-cols-3 gap-2 w-full p-2">
                {value.map((file, idx) => (
                  <div key={idx} className="relative group rounded-lg overflow-hidden border bg-background aspect-square">
                    <img
                      src={file instanceof File ? URL.createObjectURL(file) : String(file)}
                      alt={`Upload ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                      className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-90 hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-1.5 items-center justify-center aspect-square border-2 border-dashed border-border rounded-lg">
                  {enableCamera && (
                    <button
                      type="button"
                      onClick={handleCameraClick}
                      className="p-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs"
                      title="Take Photo"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="p-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-xs"
                    title="Browse More"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={
                    value instanceof File
                      ? URL.createObjectURL(value)
                      : typeof value === 'string' && value.trim()
                        ? value
                        : existingUrl!
                  }
                  alt="Uploaded preview"
                  className="max-h-[145px] max-w-full object-contain rounded-lg p-1"
                />
                <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                  {enableCamera && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleCameraClick(); }}
                      className="p-1.5 bg-primary text-primary-foreground rounded-full shadow hover:bg-primary/90 transition-colors"
                      title="Retake with camera"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Crop / Adjust Button */}
                  {enableCrop && (
                    <button
                      type="button"
                      onClick={handleOpenCropForCurrent}
                      className="p-1.5 bg-background border border-border text-foreground rounded-full shadow hover:bg-muted transition-colors"
                      title="Crop / adjust image"
                    >
                      <CropIcon className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      inputRef.current?.click();
                    }}
                    className="p-1.5 bg-background border border-border text-foreground rounded-full shadow hover:bg-muted transition-colors"
                    title="Change file"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile();
                    }}
                    className="p-1.5 bg-destructive text-destructive-foreground rounded-full shadow hover:bg-destructive/90 transition-colors"
                    title="Remove image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive font-medium">{error}</p>
      )}

      {/* ══════════════════════ CAMERA MODAL (PORTAL) ══════════════════════ */}
      {cameraOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] pointer-events-auto flex items-end sm:items-center justify-center backdrop-blur-[1px] bg-black/25 p-0 sm:p-4">
          <div className="bg-gray-950 text-white rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col w-full sm:max-w-md border border-gray-800 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div className="flex items-center gap-2 text-white">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-semibold">Camera Capture</span>
              </div>
              <button
                type="button"
                onClick={closeCamera}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Viewfinder */}
            <div className="relative bg-black w-full aspect-[4/3] flex items-center justify-center overflow-hidden">
              {cameraError ? (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                    <Camera className="w-6 h-6 text-red-400" />
                  </div>
                  <p className="text-red-300 text-xs leading-relaxed">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => startCamera(facingMode)}
                    className="px-4 py-2 bg-primary text-primary-foreground text-xs rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry Camera
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* Corner Viewfinder Guides */}
                  {isCameraReady && (
                    <div className="absolute inset-0 pointer-events-none p-4">
                      <div className="absolute top-4 left-4 w-7 h-7 border-l-2 border-t-2 border-white/80 rounded-tl" />
                      <div className="absolute top-4 right-4 w-7 h-7 border-r-2 border-t-2 border-white/80 rounded-tr" />
                      <div className="absolute bottom-4 left-4 w-7 h-7 border-l-2 border-b-2 border-white/80 rounded-bl" />
                      <div className="absolute bottom-4 right-4 w-7 h-7 border-r-2 border-b-2 border-white/80 rounded-br" />
                    </div>
                  )}

                  {!isCameraReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        <span className="text-xs text-gray-300 font-medium">Starting camera…</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Camera Actions Bar */}
            <div className="flex items-center justify-between px-8 py-4 bg-gray-950 border-t border-gray-900">
              <button
                type="button"
                onClick={flipCamera}
                disabled={!isCameraReady || !!cameraError}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-30"
                title="Flip Camera"
              >
                <FlipHorizontal className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={capturePhoto}
                disabled={!isCameraReady || !!cameraError}
                className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
                title="Capture Photo"
              >
                <div className="w-11 h-11 rounded-full bg-white shadow" />
              </button>

              <button
                type="button"
                onClick={() => startCamera(facingMode)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                title="Refresh Camera"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ══════════════════════ CROP MODAL (PORTAL) ══════════════════════ */}
      {cropOpen && tempImage && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] pointer-events-auto backdrop-blur-[1px] bg-black/25 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-card text-card-foreground border border-border rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col">
            <div className="p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-primary" />
                  <h3 className="text-base font-semibold text-foreground">Crop & Adjust Image</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setRotation(prev => prev - 90)}
                    title="Rotate left"
                  >
                    <RotateCw className="h-4 w-4 -scale-x-100" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setRotation(prev => prev + 90)}
                    title="Rotate right"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setZoom(prev => Math.max(0.2, prev - 0.1))}
                    title="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setZoom(prev => Math.min(3, prev + 0.1))}
                    title="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Crop Workspace */}
              <div className="flex flex-col md:flex-row gap-5">
                <div className="flex-1 flex items-center justify-center bg-muted/40 rounded-xl overflow-hidden min-h-[280px] max-h-[440px] p-2 border border-border">
                  <ReactCrop
                    crop={crop}
                    onChange={(_, percentCrop) => setCrop(percentCrop)}
                    onComplete={(c) => setCompletedCrop(c)}
                    aspect={aspectRatio}
                    circularCrop={false}
                    className="max-w-full max-h-[400px]"
                  >
                    <img
                      ref={imgRef}
                      src={tempImage}
                      alt="Crop preview"
                      crossOrigin="anonymous"
                      className="max-w-full max-h-[380px] object-contain"
                      onLoad={onImageLoad}
                      style={{
                        transform: `rotate(${rotation}deg) scale(${zoom})`,
                      }}
                    />
                  </ReactCrop>
                </div>

                {/* Sidebar Preview & Sliders */}
                <div className="w-full md:w-64 space-y-4">
                  <div className="p-3 bg-muted/30 rounded-xl border border-border space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview</h4>
                    <div className="w-full h-36 bg-background rounded-lg border border-border flex items-center justify-center overflow-hidden p-1">
                      <canvas
                        ref={previewCanvasRef}
                        className="max-w-full max-h-full object-contain rounded"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="flex justify-between text-muted-foreground mb-1">
                        <span>Rotation</span>
                        <span>{rotation}°</span>
                      </div>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        value={rotation}
                        onChange={(e) => setRotation(parseInt(e.target.value))}
                        className="w-full accent-primary h-1.5 rounded-lg bg-muted cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-muted-foreground mb-1">
                        <span>Zoom</span>
                        <span>{zoom.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="3"
                        step="0.1"
                        value={zoom}
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        className="w-full accent-primary h-1.5 rounded-lg bg-muted cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelCrop}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={applyCrop}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Check className="h-4 w-4 mr-1.5" />
                  Apply & Crop
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <PermissionModal
        open={cameraFlow.phase === 'soft' || cameraFlow.phase === 'blocked'}
        type="camera"
        mode={cameraFlow.phase === 'blocked' ? 'blocked' : 'soft'}
        busy={cameraFlow.phase === 'requesting'}
        onAllow={cameraFlow.onAllow}
        onCancel={cameraFlow.onCancel}
        onRetry={cameraFlow.retryAfterSettings}
        fallback={{
          label: "Upload from file",
          onClick: () => inputRef.current?.click(),
        }}
      />
    </div>
  );
}

export const FileInput = ImageUpload;
export default ImageUpload;
