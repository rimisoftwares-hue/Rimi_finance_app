import { X } from 'lucide-react';
import { Dialog, DialogContent } from '../ui/dialog';

interface PhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt: string;
}

const PhotoModal = ({ isOpen, onClose, src, alt }: PhotoModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-2 bg-card border-border">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-background/80 backdrop-blur-sm text-foreground hover:bg-background transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <img
          src={src}
          alt={alt}
          className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
        />
      </DialogContent>
    </Dialog>
  );
};

export default PhotoModal;
