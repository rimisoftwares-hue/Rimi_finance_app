import React, { useCallback, useState , useRef } from 'react';
import { Upload, X, Camera } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../lib/utils';

interface ImageUploadProps {
  label: string;
  required?: boolean;
  accept?: string;
  multiple?: boolean;
  value?: File | File[];
  onChange: (files: File | File[] | undefined) => void;
  className?: string;
}

export function ImageUpload({
  label,
  required = false,
  accept = "image/*",
  multiple = false,
  value,
  onChange,
  className
}: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    
    const files = Array.from(e.dataTransfer.files);
    if (files && files.length > 0) {
      if (multiple) {
        onChange(files);
      } else {
        onChange(files[0]);
      }
    }
  }, [multiple, onChange]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      if (multiple) {
        onChange(files);
      } else {
        onChange(files[0]);
      }
    }
  }, [multiple, onChange]);

  const removeFile = useCallback((index?: number) => {
    if (multiple && Array.isArray(value) && typeof index === 'number') {
      const newFiles = value.filter((_, i) => i !== index);
      onChange(newFiles.length > 0 ? newFiles : undefined);
    } else {
      onChange(undefined);
    }
  }, [multiple, value, onChange]);

  const getPreviewUrl = (file: File) => URL.createObjectURL(file);
  const handleClick = () => {
    inputRef.current?.click();
  };

  // const renderPreview = () => {
  //   if (!value) return null;

  //   if (multiple && Array.isArray(value)) {
  //     return (
  //       <div className="grid grid-cols-2 gap-4 mt-4">
  //         {value.map((file, index) => (
  //           <div key={index} className="relative group">
  //             <img
  //               src={getPreviewUrl(file)}
  //               alt={`Preview ${index + 1}`}
  //               className="w-full h-24 object-cover rounded-lg border border-border"
  //             />
  //             <Button
  //               type="button"
  //               variant="destructive"
  //               size="icon"
  //               className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
  //               onClick={() => removeFile(index)}
  //             >
  //               <X className="h-3 w-3" />
  //             </Button>
  //           </div>
  //         ))}
  //       </div>
  //     );
  //   } else if (value instanceof File) {
  //     return (
  //       <div className="relative group mt-4">
  //         <img
  //           src={getPreviewUrl(value)}
  //           alt="Preview"
  //           className="w-full h-32 object-cover rounded-lg border border-border"
  //         />
  //         <Button
  //           type="button"
  //           variant="destructive"
  //           size="icon"
  //           className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
  //           onClick={() => removeFile()}
  //         >
  //           <X className="h-3 w-3" />
  //         </Button>
  //       </div>
  //     );
  //   }

  //   return null;
  // };


  const renderPreview = () => {
  if (!value) return null;

  if (multiple && Array.isArray(value)) {
    return (
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {value.map((file, index) => (
          <div key={index} className="relative group">
            <img
              src={getPreviewUrl(file)}
              className="w-full h-28 object-cover rounded-md border"
            />

            <button
              type="button"
              onClick={() => removeFile(index)}
              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    );
  }

  // Single File
  if (value instanceof File) {
    return (
      <div className="mt-3 relative group w-32">
        <img
          src={getPreviewUrl(value)}
          className="w-full h-28 object-cover rounded-md border"
        />
        <button
          type="button"
          onClick={() => removeFile()}
          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return null;
};

  return (
    
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      
      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 text-center transition-colors",
          dragActive 
            ? "border-primary bg-primary/5" 
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          "cursor-pointer"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        <div className="flex flex-col items-center space-y-2">
          {value ? (
            <Camera className="h-8 w-8 text-primary" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <div className="text-sm text-muted-foreground">
            {value ? (
              multiple && Array.isArray(value) ? (
                `${value.length} file(s) selected`
              ) : (
                "1 file selected"
              )
            ) : (
              <>
                Drop {multiple ? 'files' : 'file'} here or{' '}
                <span className="text-primary font-medium">browse</span>
              </>
            )}
          </div>
        </div>
      </div>

      {renderPreview()}
    </div>
  );
}