import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { useFormStore } from '../../types/formStore';
import { useToast } from '../../hooks/use-toast';
import { LoanType } from './LoanTypeToggle';
import {
  ScanLine,
  UploadCloud,
  FileImage,
  X,
  CheckCircle2,
  FileText,
  Car,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Check,
  Info,
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getOcrConfig,
  prepareFileForOcr,
  scanSingleImageDirect,
  createOcrBatch,
  uploadToPresignedUrl,
  completeOcrJob,
  getOcrBatch,
  retryOcrJob,
  cancelOcrBatch,
  checkVehicleAvailability,
  checkOcrDuplicates,
  ocrErrorMessage,
} from '../../api/ocrApi';
import type {
  OcrConfig,
  OcrBatchState,
  LedgerV1,
  VehicleAvailability,
} from '../../types/ocr';
import {
  mapOcrToStore,
  applyLedgerOverrides,
  type OcrApplyRequest,
  type OcrSection,
} from '../../utils/ocrMapper';

export interface AiEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeLoanType: LoanType;
  ocrConfig?: OcrConfig | null;
  onApply: (req: OcrApplyRequest) => void;
}

type DialogStage = 'upload' | 'scanning' | 'review' | 'error';
type ScanPhase = 'idle' | 'direct' | 'uploading' | 'queued' | 'processing' | 'finalizing';

const DEFAULT_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const POLL_FAST_MS = 1000;
const POLL_FAST_WINDOW_MS = 20000;
const POLL_SLOW_MS = 2000;
const POLL_TIMEOUT_MS = 120000;
const PROGRESS_TICK_MS = 150;

export const AiEntryDialog: React.FC<AiEntryDialogProps> = ({
  open,
  onOpenChange,
  activeLoanType,
  ocrConfig: externalConfig,
  onApply,
}) => {
  const { toast } = useToast();
  const { customer: storeCustomer } = useFormStore();

  const [config, setConfig] = useState<OcrConfig | null>(externalConfig || null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<LoanType>(activeLoanType);
  const [isDragOver, setIsDragOver] = useState(false);

  const [stage, setStage] = useState<DialogStage>('upload');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchState, setBatchState] = useState<OcrBatchState | null>(null);
  const [rawResult, setRawResult] = useState<LedgerV1 | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  // Review state
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, string>>({});
  const [useSuggestedVehicle, setUseSuggestedVehicle] = useState(false);
  const [sectionsEnabled, setSectionsEnabled] = useState<Record<OcrSection, boolean>>({
    customer: true,
    vehicle: true,
    loan: true,
    guardian: true,
  });
  const [overwriteFilled, setOverwriteFilled] = useState(false);
  const [applyHplno, setApplyHplno] = useState(true);
  const [availability, setAvailability] = useState<VehicleAvailability | null>(null);
  const [duplicates, setDuplicates] = useState<{ hplnoExists: boolean; aadharExists: boolean }>({
    hplnoExists: false,
    aadharExists: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const scanPhaseRef = useRef<ScanPhase>('idle');
  const directScanStartRef = useRef<number>(0);
  const backendPercentRef = useRef<number>(0);
  const unfinishedBatchRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const maxImages = Math.min(Math.max(config?.maxImages || 1, 1), 5);
  const maxFileBytes = config?.maxFileBytes || DEFAULT_MAX_BYTES;
  const allowedMime = config?.allowedMime || DEFAULT_ALLOWED_MIME;

  const stopProgressTimer = useCallback((resetPercent = false) => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (resetPercent) {
      scanPhaseRef.current = 'idle';
      backendPercentRef.current = 0;
      if (isMountedRef.current) {
        setProgress(0);
      }
    }
  }, []);

  const startProgressTimer = useCallback(() => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
    }
    progressTimerRef.current = window.setInterval(() => {
      if (!isMountedRef.current) return;
      const phase = scanPhaseRef.current;
      if (phase === 'direct') {
        const tSec = Math.max(0, (Date.now() - directScanStartRef.current) / 1000);
        const curve = Math.min(92, Math.max(1, 92 * (1 - Math.exp(-tSec / 6))));
        if (tSec >= 1.2) {
          setStatusText((prev) =>
            prev === 'Preparing & uploading image...' ? 'Reading handwritten ledger...' : prev
          );
        }
        setProgress((prev) => Math.min(92, Math.max(prev, curve)));
        return;
      }
      setProgress((prev) => {
        if (phase === 'uploading') {
          if (prev >= 30) return 30;
          return Math.min(30, prev + Math.max(0.6, (30 - prev) * 0.14));
        }
        if (phase === 'queued') {
          if (prev >= 45) return 45;
          return Math.min(45, prev + Math.max(1.2, (45 - prev) * 0.25));
        }
        if (phase === 'processing') {
          const floor = Math.min(90, Math.max(45, prev, backendPercentRef.current));
          if (floor >= 90) return 90;
          const step = Math.max(0.12, (90 - floor) * 0.03);
          return Math.min(90, floor + step);
        }
        if (phase === 'finalizing') {
          return 100;
        }
        return prev;
      });
    }, PROGRESS_TICK_MS);
  }, []);

  const stopActiveOperations = useCallback(
    (cancelRemote = false, resetPercent = true) => {
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      stopProgressTimer(resetPercent);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (cancelRemote && unfinishedBatchRef.current) {
        const idToCancel = unfinishedBatchRef.current;
        unfinishedBatchRef.current = null;
        cancelOcrBatch(idToCancel).catch(() => {});
      }
    },
    [stopProgressTimer]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopActiveOperations(true, false);
    };
  }, [stopActiveOperations]);

  // Load config & reset when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedCategory(activeLoanType);
      setSelectedFiles([]);
      setPreviewUrls([]);
      setStage('upload');
      setProgress(0);
      setStatusText('');
      setErrorMessage(null);
      setActiveBatchId(null);
      setBatchState(null);
      setRawResult(null);
      setFieldOverrides({});
      setUseSuggestedVehicle(false);
      setSectionsEnabled({ customer: true, vehicle: true, loan: true, guardian: true });
      setOverwriteFilled(false);
      setApplyHplno(!storeCustomer.hplno?.trim());
      setAvailability(null);
      setDuplicates({ hplnoExists: false, aadharExists: false });
      if (fileInputRef.current) fileInputRef.current.value = '';

      getOcrConfig()
        .then((cfg) => {
          if (isMountedRef.current) setConfig(cfg);
        })
        .catch(() => {});
    } else {
      stopActiveOperations(true, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (externalConfig) setConfig(externalConfig);
  }, [externalConfig]);

  // Re-evaluate mapped OCR data whenever rawResult, category, overrides, or suggestedVehicle changes
  const mappedOcr = useMemo(() => {
    if (!rawResult) return null;
    const overridden = applyLedgerOverrides(rawResult, fieldOverrides, useSuggestedVehicle);
    return mapOcrToStore(overridden, selectedCategory);
  }, [rawResult, fieldOverrides, useSuggestedVehicle, selectedCategory]);

  // Re-run vehicle availability check in review if vehicle number or category changes
  useEffect(() => {
    if (stage !== 'review' || !mappedOcr) return;
    const regNo = mappedOcr.vehicle.vehicleNumber;
    if (!regNo) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    checkVehicleAvailability(regNo, mappedOcr.vehicle.engine_number, mappedOcr.vehicle.chassis_number)
      .then((avail) => {
        if (cancelled) return;
        setAvailability(avail);
        const blocked =
          avail.state === 'in_use' ||
          avail.state === 'unavailable' ||
          Boolean(avail.conflicts && avail.conflicts.length > 0);
        if (blocked) {
          setSectionsEnabled((prev) => ({ ...prev, vehicle: false }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [stage, mappedOcr?.vehicle.vehicleNumber, mappedOcr?.vehicle.engine_number, mappedOcr?.vehicle.chassis_number]);

  const handleAddFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    if (!list.length) return;

    const nextFiles = [...selectedFiles];
    const nextUrls = [...previewUrls];

    for (const file of list) {
      if (nextFiles.length >= maxImages) {
        toast({
          title: 'Maximum Images Reached',
          description: `You can upload at most ${maxImages} image${maxImages > 1 ? 's' : ''}.`,
          variant: 'destructive',
        });
        break;
      }
      if (!allowedMime.includes(file.type)) {
        toast({
          title: 'Unsupported Image Type',
          description: 'Please use a JPEG, PNG, or WebP photo (HEIC is not supported).',
          variant: 'destructive',
        });
        continue;
      }
      if (file.size <= 0 || file.size > maxFileBytes) {
        const maxMb = (maxFileBytes / (1024 * 1024)).toFixed(0);
        toast({
          title: 'File Too Large',
          description: `Please choose an image under ${maxMb} MB.`,
          variant: 'destructive',
        });
        continue;
      }
      nextFiles.push(file);
      nextUrls.push(URL.createObjectURL(file));
    }

    setSelectedFiles(nextFiles);
    setPreviewUrls(nextUrls);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => {
      const target = prev[index];
      if (target && target.startsWith('blob:')) URL.revokeObjectURL(target);
      return prev.filter((_, i) => i !== index);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (stage === 'scanning') return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  const runPostExtractionChecks = async (result: LedgerV1, category: LoanType) => {
    if (!isMountedRef.current) return;
    scanPhaseRef.current = 'finalizing';
    stopProgressTimer(false);
    setProgress(100);
    setStatusText('Finalizing extracted fields...');

    const preliminary = mapOcrToStore(result, category);
    const regNo = preliminary.vehicle.vehicleNumber;
    const hplno = preliminary.customer.hplno;
    const aadhar = preliminary.customer.aadhar_id;

    const [availRes, dupRes] = await Promise.all([
      regNo
        ? checkVehicleAvailability(regNo, preliminary.vehicle.engine_number, preliminary.vehicle.chassis_number).catch(
            () => null
          )
        : Promise.resolve(null),
      hplno || aadhar
        ? checkOcrDuplicates(hplno, aadhar).catch(() => ({ hplnoExists: false, aadharExists: false }))
        : Promise.resolve({ hplnoExists: false, aadharExists: false }),
      new Promise((resolve) => setTimeout(resolve, 250)),
    ]);

    if (!isMountedRef.current) return;
    setAvailability(availRes);
    setDuplicates(dupRes);

    const vehicleBlocked =
      availRes?.state === 'in_use' ||
      availRes?.state === 'unavailable' ||
      Boolean(availRes?.conflicts && availRes.conflicts.length > 0);

    setSectionsEnabled({
      customer: Object.keys(preliminary.customer).length > 0,
      vehicle: !vehicleBlocked && Object.keys(preliminary.vehicle).filter((k) => k !== 'deal_type').length > 0,
      loan: Object.keys(preliminary.loan).length > 0,
      guardian: Object.keys(preliminary.guardian).filter((k) => k !== 'customer_hplno').length > 0,
    });
    setApplyHplno(!storeCustomer.hplno?.trim());
    scanPhaseRef.current = 'idle';
    setRawResult(result);
    setStage('review');
  };

  const pollBatchUntilDone = (batchId: string, startedAt: number, category: LoanType) => {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= POLL_TIMEOUT_MS) {
      unfinishedBatchRef.current = null;
      stopProgressTimer(true);
      if (!isMountedRef.current) return;
      setErrorMessage('This is taking longer than usual. Please try again.');
      setStage('error');
      return;
    }

    const delay = elapsed < POLL_FAST_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS;
    pollTimerRef.current = window.setTimeout(async () => {
      if (!isMountedRef.current) return;
      try {
        const state = await getOcrBatch(batchId);
        if (!isMountedRef.current) return;
        setBatchState(state);

        if (typeof state.progress?.percent === 'number') {
          backendPercentRef.current = state.progress.percent;
          if (state.status === 'processing') {
            setProgress((prev) => Math.min(90, Math.max(prev, state.progress!.percent)));
          }
        }

        if (state.status === 'complete' || state.status === 'needs_review') {
          unfinishedBatchRef.current = null;
          if (state.mergedResult) {
            await runPostExtractionChecks(state.mergedResult, category);
          } else {
            stopProgressTimer(true);
            if (!isMountedRef.current) return;
            setErrorMessage('No readable data was returned from this card. Please try scanning again.');
            setStage('error');
          }
          return;
        }

        if (state.status === 'failed' || state.status === 'cancelled' || state.status === 'expired') {
          unfinishedBatchRef.current = null;
          stopProgressTimer(true);
          if (!isMountedRef.current) return;
          const failedJob = state.jobs.find((j) => j.status === 'failed');
          setErrorMessage(ocrErrorMessage(failedJob?.errorCode, 'Could not read the ledger card. Please try again.'));
          setStage('error');
          return;
        }

        // Still queued / processing: timer handles smooth easing up to 90%
        scanPhaseRef.current = 'processing';
        setStatusText('Reading handwritten ledger...');
        pollBatchUntilDone(batchId, startedAt, category);
      } catch (err: any) {
        unfinishedBatchRef.current = null;
        stopProgressTimer(true);
        if (!isMountedRef.current) return;
        setErrorMessage(err?.message || 'Lost connection while checking scan status.');
        setStage('error');
      }
    }, delay);
  };

  const startScan = async (forceRescan = false) => {
    if (!selectedFiles.length) return;
    stopActiveOperations(false, true);

    const isSingle = selectedFiles.length === 1;
    scanPhaseRef.current = isSingle ? 'direct' : 'uploading';
    directScanStartRef.current = Date.now();
    backendPercentRef.current = 0;
    setStage('scanning');
    setProgress(1);
    setStatusText(isSingle ? 'Preparing & uploading image...' : 'Uploading image...');
    setErrorMessage(null);
    setFallbackUsed(false);
    setFieldOverrides({});
    setUseSuggestedVehicle(false);
    startProgressTimer();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const targetMaxEdge = config?.imageMaxEdge || 2048;
      const preparedFiles = await Promise.all(selectedFiles.map((f) => prepareFileForOcr(f, targetMaxEdge, 0.86)));
      if (!isMountedRef.current || controller.signal.aborted) return;

      // Single-image direct path (POST /api/ocr/scan)
      if (preparedFiles.length === 1) {
        setStatusText('Reading handwritten ledger...');
        const directRes = await scanSingleImageDirect(selectedCategory, preparedFiles[0], controller.signal);
        if (!isMountedRef.current || controller.signal.aborted) return;

        setFallbackUsed(Boolean(directRes.fallbackUsed));
        setConfig((prev) =>
          prev && typeof prev.dailyRemaining === 'number'
            ? { ...prev, dailyRemaining: Math.max(0, prev.dailyRemaining - 1) }
            : prev
        );

        if (directRes.mergedResult) {
          await runPostExtractionChecks(directRes.mergedResult, selectedCategory);
        } else {
          stopProgressTimer(true);
          if (!isMountedRef.current) return;
          setErrorMessage('No readable data was returned from this card. Please try scanning again.');
          setStage('error');
        }
        return;
      }

      // Multi-image batch path (kept intact for >1 image)
      const batch = await createOcrBatch(selectedCategory, preparedFiles, forceRescan);
      if (!isMountedRef.current || controller.signal.aborted) return;
      setActiveBatchId(batch.batchId);
      unfinishedBatchRef.current = batch.batchId;

      // Stage 1: Upload each file to its presigned URL (smoothly 1% -> 30%)
      for (let i = 0; i < batch.jobs.length; i++) {
        const job = batch.jobs[i];
        const file = preparedFiles[i];
        if (!isMountedRef.current || controller.signal.aborted) return;
        setStatusText('Uploading image...');
        await uploadToPresignedUrl(job.uploadUrl, file, controller.signal, job.jobId);
      }

      if (!isMountedRef.current || controller.signal.aborted) return;
      // Stage 2: Confirm each job / queued (smoothly -> 45%)
      scanPhaseRef.current = 'queued';
      setProgress((prev) => Math.max(prev, 30));
      setStatusText('Waiting in queue...');
      for (let i = 0; i < batch.jobs.length; i++) {
        if (!isMountedRef.current || controller.signal.aborted) return;
        await completeOcrJob(batch.jobs[i].jobId);
      }

      if (!isMountedRef.current || controller.signal.aborted) return;
      // Stage 3: Processing / polling (ease slowly 45% -> 90%)
      scanPhaseRef.current = 'processing';
      setProgress((prev) => Math.max(prev, 45));
      setStatusText('Reading handwritten ledger...');
      pollBatchUntilDone(batch.batchId, Date.now(), selectedCategory);
    } catch (err: any) {
      if (
        controller.signal.aborted ||
        err?.name === 'CanceledError' ||
        err?.code === 'ERR_CANCELED' ||
        !isMountedRef.current
      ) {
        return;
      }
      unfinishedBatchRef.current = null;
      stopProgressTimer(true);
      setErrorMessage(err?.message || 'Failed to start AI scan.');
      setStage('error');
    }
  };

  const handleRetryFailedJobs = async () => {
    if (!batchState || !activeBatchId) {
      startScan(true);
      return;
    }
    const failedJobs = batchState.jobs.filter((j) => j.status === 'failed' && j.retryCount < 3);
    if (!failedJobs.length) {
      startScan(true);
      return;
    }
    try {
      stopActiveOperations(false, true);
      scanPhaseRef.current = 'queued';
      setStage('scanning');
      setProgress(35);
      setStatusText('Waiting in queue...');
      setErrorMessage(null);
      startProgressTimer();
      unfinishedBatchRef.current = activeBatchId;
      for (const job of failedJobs) {
        await retryOcrJob(job.jobId);
      }
      if (!isMountedRef.current) return;
      scanPhaseRef.current = 'processing';
      setProgress((prev) => Math.max(prev, 45));
      setStatusText('Reading handwritten ledger...');
      pollBatchUntilDone(activeBatchId, Date.now(), selectedCategory);
    } catch (err: any) {
      stopProgressTimer(true);
      if (!isMountedRef.current) return;
      setErrorMessage(err?.message || 'Retry failed. Please use "Scan again".');
      setStage('error');
    }
  };

  const handleApplyToForm = () => {
    if (!mappedOcr) return;

    const vehicleBlocked =
      availability?.state === 'in_use' ||
      availability?.state === 'unavailable' ||
      Boolean(availability?.conflicts && availability.conflicts.length > 0);

    const finalVehicle = { ...mappedOcr.vehicle };
    if (selectedCategory === 'consulting') {
      finalVehicle.deal_type = 'consulting';
      if (availability?.state === 'available' && availability.vehicle) {
        const av = availability.vehicle;
        finalVehicle.id = availability.vehicleId || av.id;
        finalVehicle.isNewVehicle = false;
        if (!finalVehicle.brand && av.brand) finalVehicle.brand = av.brand;
        if (!finalVehicle.model_name && av.model_name) finalVehicle.model_name = av.model_name;
        if (!finalVehicle.modelName && (av.model_name || av.vehicle_modal)) {
          finalVehicle.modelName = av.model_name || av.vehicle_modal || '';
        }
        if (!finalVehicle.vehicle_modal && av.vehicle_modal) finalVehicle.vehicle_modal = av.vehicle_modal;
        if (!finalVehicle.vehicleName && (av.brand || av.model_name)) {
          finalVehicle.vehicleName = [av.brand, av.model_name].filter(Boolean).join(' ');
        }
        if (!finalVehicle.color && av.color) finalVehicle.color = av.color;
        if (!finalVehicle.type && av.type) finalVehicle.type = av.type;
      } else if (finalVehicle.vehicleNumber) {
        finalVehicle.id = `temp_${Date.now()}`;
        finalVehicle.isNewVehicle = true;
      }
    } else {
      finalVehicle.deal_type = 'finance';
      finalVehicle.isNewVehicle = false;
    }

    onApply({
      targetLoanType: selectedCategory,
      mode: overwriteFilled ? 'overwrite' : 'fill_empty',
      sections: {
        customer: sectionsEnabled.customer,
        vehicle: sectionsEnabled.vehicle && !vehicleBlocked,
        loan: sectionsEnabled.loan,
        guardian: sectionsEnabled.guardian,
      },
      applyHplno,
      customer: mappedOcr.customer,
      vehicle: finalVehicle,
      loan: mappedOcr.loan,
      guardian: mappedOcr.guardian,
    });

    unfinishedBatchRef.current = null;
    onOpenChange(false);
  };

  const handleDialogClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      stopActiveOperations(true);
    }
    onOpenChange(nextOpen);
  };

  const suggestedVehicle = rawResult?.ai_predictions_and_options?.suggested_vehicle;
  const hasSuggestedVehicle = Boolean(
    suggestedVehicle &&
      (suggestedVehicle.brand ||
        suggestedVehicle.vehicleName ||
        suggestedVehicle.model_name ||
        suggestedVehicle.manufacture_year ||
        suggestedVehicle.type)
  );
  const uncertainFields = rawResult?.ai_predictions_and_options?.uncertain_fields || [];
  const shiftedFields = rawResult?.ai_predictions_and_options?.shifted_field_corrections || [];
  const nameMismatches = rawResult?.ai_predictions_and_options?.name_mismatches || [];

  const vehicleBlocked =
    availability?.state === 'in_use' ||
    availability?.state === 'unavailable' ||
    Boolean(availability?.conflicts && availability.conflicts.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent
        className="max-w-xl sm:max-w-2xl w-full p-6 max-h-[90vh] flex flex-col"
        onPointerDownOutside={(e) => stage === 'scanning' && e.preventDefault()}
      >
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border/50 text-left shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-foreground">
                <ScanLine className="w-4 h-4 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold leading-tight">AI Scan</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {stage === 'review'
                    ? 'Review extracted fields and choose what to apply to the form'
                    : 'Upload a handwritten ledger card to auto-extract details'}
                </DialogDescription>
              </div>
            </div>
            {typeof config?.dailyRemaining === 'number' && (
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground font-medium">
                {config.dailyRemaining} scans left today
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="py-3 space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
          <AnimatePresence mode="wait">
            {stage === 'upload' && (
              <motion.div
                key="upload-stage"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Loan Category Selector */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">Loan Category</label>
                  <div className="grid grid-cols-2 gap-2 bg-secondary/60 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('consulting')}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                        selectedCategory === 'consulting'
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Consulting Loan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('vehicle')}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                        selectedCategory === 'vehicle'
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Car className="w-3.5 h-3.5" />
                      <span>Vehicle Loan</span>
                    </button>
                  </div>
                </div>

                {/* Drop Zone */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    Ledger Document Photo *
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={allowedMime.join(',')}
                    multiple={maxImages > 1}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handleAddFiles(e.target.files);
                    }}
                  />

                  {selectedFiles.length === 0 ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                        isDragOver
                          ? 'border-primary bg-primary/5'
                          : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center mb-2.5 text-muted-foreground">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-medium text-foreground">
                        Click to browse or drag & drop image
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Supports JPG, PNG, WEBP (Max {maxImages} file{maxImages > 1 ? 's' : ''})
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedFiles.map((file, idx) => (
                        <div
                          key={`${file.name}-${idx}`}
                          className="border border-border rounded-xl p-3 bg-secondary/40 flex items-center gap-3"
                        >
                          <div className="w-14 h-14 rounded-lg bg-background border border-border overflow-hidden shrink-0 flex items-center justify-center">
                            {previewUrls[idx] ? (
                              <img
                                src={previewUrls[idx]}
                                alt={`Ledger Preview ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <FileImage className="w-6 h-6 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveFile(idx)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-lg shrink-0"
                            title="Remove image"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      {selectedFiles.length < maxImages && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full text-xs h-8 gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add another image ({selectedFiles.length}/{maxImages})
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {stage === 'scanning' && (
              <motion.div
                key="scanning-stage"
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.96 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
                className="py-8 flex flex-col items-center justify-center text-center space-y-4"
              >
                <Loader2
                  className={`w-7 h-7 text-primary ${prefersReducedMotion ? '' : 'animate-spin'}`}
                />

                <div className="text-3xl font-bold tabular-nums text-foreground leading-none">
                  {Math.round(progress)}%
                </div>

                <div className="w-full max-w-xs space-y-2">
                  <Progress value={Math.round(progress)} className="h-1.5" />
                  <p className="text-xs font-medium text-muted-foreground">
                    {statusText || 'Uploading image...'}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    stopActiveOperations(true, true);
                    setStage('upload');
                  }}
                  className="h-8 px-4 text-xs mt-1"
                >
                  Cancel
                </Button>
              </motion.div>
            )}

            {stage === 'error' && (
              <motion.div
                key="error-stage"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-6 flex flex-col items-center text-center space-y-3"
              >
                <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-md">
                  <p className="text-sm font-semibold text-foreground">Scan Could Not Complete</p>
                  <p className="text-xs text-muted-foreground">
                    {errorMessage || 'An unexpected error occurred during AI extraction.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStage('upload')}
                    className="text-xs h-8"
                  >
                    Change Photo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRetryFailedJobs}
                    className="text-xs h-8 gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => startScan(true)}
                    className="text-xs h-8 gap-1.5"
                  >
                    <ScanLine className="w-3.5 h-3.5" />
                    Scan again
                  </Button>
                </div>
              </motion.div>
            )}

            {stage === 'review' && mappedOcr && (
              <motion.div
                key="review-stage"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3 text-xs"
              >
                {/* Top bar: Category selector + Scan again */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-secondary/40 p-2.5 rounded-xl border border-border">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">Apply as:</span>
                    <div className="inline-flex rounded-lg bg-secondary p-0.5">
                      <button
                        type="button"
                        onClick={() => setSelectedCategory('consulting')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          selectedCategory === 'consulting'
                            ? 'bg-background text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Consulting
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCategory('vehicle')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          selectedCategory === 'vehicle'
                            ? 'bg-background text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Vehicle Loan
                      </button>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => startScan(true)}
                    className="h-7 px-2.5 text-xs gap-1"
                    title="Re-run AI extraction ignoring cached result"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Scan again
                  </Button>
                </div>

                {/* Fallback model notice */}
                {fallbackUsed && (
                  <div className="p-2.5 rounded-lg border border-border bg-secondary/40 text-muted-foreground flex items-start gap-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-foreground" />
                    <span>A faster backup AI model was used; please check the values carefully</span>
                  </div>
                )}

                {/* Loan type switch notice */}
                {selectedCategory !== activeLoanType && (
                  <div className="p-2.5 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 flex items-start gap-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Applying will switch the form from{' '}
                      <strong>{activeLoanType === 'consulting' ? 'Consulting' : 'Vehicle'}</strong> to{' '}
                      <strong>{selectedCategory === 'consulting' ? 'Consulting' : 'Vehicle'}</strong> and replace Step 2
                      fields.
                    </span>
                  </div>
                )}

                {/* Duplicate Warnings */}
                {(duplicates.hplnoExists || duplicates.aadharExists) && (
                  <div className="p-2.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 space-y-1">
                    {duplicates.hplnoExists && (
                      <div className="flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          HPL number <strong>{mappedOcr.customer.hplno}</strong> is already used in this company.
                        </span>
                      </div>
                    )}
                    {duplicates.aadharExists && (
                      <div className="flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Aadhaar number is already registered in this company.</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Suggested Vehicle Box (opt-in, unchecked by default) */}
                {hasSuggestedVehicle && suggestedVehicle && (
                  <div className="p-2.5 rounded-lg border border-border bg-secondary/30 flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-foreground">
                        AI Vehicle Suggestion:{' '}
                        {[
                          suggestedVehicle.brand,
                          suggestedVehicle.model_name || suggestedVehicle.vehicleName,
                          suggestedVehicle.manufacture_year,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                      {suggestedVehicle.confidence_note && (
                        <p className="text-[11px] text-muted-foreground">{suggestedVehicle.confidence_note}</p>
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer shrink-0 font-medium">
                      <input
                        type="checkbox"
                        checked={useSuggestedVehicle}
                        onChange={(e) => setUseSuggestedVehicle(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>Use suggestion</span>
                    </label>
                  </div>
                )}

                {/* Uncertain Fields Picker */}
                {uncertainFields.length > 0 && (
                  <div className="p-2.5 rounded-lg border border-border bg-secondary/20 space-y-2">
                    <p className="font-semibold text-foreground">Uncertain Readings (pick to override):</p>
                    {uncertainFields.map((uf, idx) => (
                      <div key={`${uf.field_path}-${idx}`} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>
                            <strong className="text-foreground">{uf.field_path}</strong>
                            {uf.raw_text ? ` (written: "${uf.raw_text}")` : ''}
                          </span>
                          {uf.reason && <span>{uf.reason}</span>}
                        </div>
                        {uf.options.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {uf.options.map((opt) => {
                              const active = fieldOverrides[uf.field_path] === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() =>
                                    setFieldOverrides((prev) => ({
                                      ...prev,
                                      [uf.field_path]: active ? '' : opt,
                                    }))
                                  }
                                  className={`px-2 py-0.5 rounded border text-[11px] font-medium transition-colors ${
                                    active
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background text-foreground border-border hover:bg-muted'
                                  }`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Shifted field / Name mismatch notices */}
                {(shiftedFields.length > 0 || nameMismatches.length > 0) && (
                  <div className="p-2 rounded-lg border border-border bg-muted/40 text-[11px] text-muted-foreground space-y-1">
                    {shiftedFields.map((sf, i) => (
                      <div key={`sf-${i}`}>
                        Moved <strong>{sf.written_value}</strong> from "{sf.printed_label}" to{' '}
                        <strong>{sf.mapped_to_field}</strong>.
                      </div>
                    ))}
                    {nameMismatches.map((nm, i) => (
                      <div key={`nm-${i}`}>
                        Name difference: Heading "{nm.account_heading_name || '-'}" vs Party "{nm.party_name || '-'}"
                        (selected: <strong>{nm.selected_for_form || '-'}</strong>).
                      </div>
                    ))}
                  </div>
                )}

                {/* Section Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Customer Section */}
                  <div className="p-3 rounded-xl border border-border bg-background space-y-2">
                    <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                      <span className="font-semibold text-foreground">1. Customer</span>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                        <input
                          type="checkbox"
                          checked={sectionsEnabled.customer}
                          onChange={(e) =>
                            setSectionsEnabled((p) => ({ ...p, customer: e.target.checked }))
                          }
                        />
                        <span>Apply</span>
                      </label>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">HPL No:</span>{' '}
                        <span className="font-medium">{mappedOcr.customer.hplno || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Name:</span>{' '}
                        <span className="font-medium">{mappedOcr.customer.cname || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Relation:</span>{' '}
                        <span className="font-medium">
                          {mappedOcr.customer.cfname
                            ? `${mappedOcr.customer.cfname.unit} ${mappedOcr.customer.cfname.value}`
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Phones:</span>{' '}
                        <span className="font-medium">
                          {mappedOcr.customer.ccontacts?.map((c) => c.number).join(', ') || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Address:</span>{' '}
                        <span className="font-medium">
                          {mappedOcr.customer.caddress?.address ||
                            [
                              mappedOcr.customer.caddress?.house_no,
                              mappedOcr.customer.caddress?.street_name,
                              mappedOcr.customer.caddress?.village,
                              mappedOcr.customer.caddress?.city,
                            ]
                              .filter(Boolean)
                              .join(', ') ||
                            '—'}
                        </span>
                      </div>
                      {mappedOcr.warnings
                        .filter((w) => w.section === 'customer')
                        .map((w, i) => (
                          <p key={i} className="text-amber-600 dark:text-amber-400">
                            • {w.message}
                          </p>
                        ))}
                    </div>
                  </div>

                  {/* Vehicle Section */}
                  <div className="p-3 rounded-xl border border-border bg-background space-y-2">
                    <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                      <span className="font-semibold text-foreground">2. Vehicle</span>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                        <input
                          type="checkbox"
                          disabled={vehicleBlocked}
                          checked={sectionsEnabled.vehicle && !vehicleBlocked}
                          onChange={(e) =>
                            setSectionsEnabled((p) => ({ ...p, vehicle: e.target.checked }))
                          }
                        />
                        <span>Apply</span>
                      </label>
                    </div>

                    {/* Availability badge */}
                    {availability && (
                      <div>
                        {availability.state === 'available' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/10 text-green-700 dark:text-green-300 text-[11px] font-medium">
                            <Check className="w-3 h-3" />
                            Matched in inventory
                          </span>
                        )}
                        {availability.state === 'not_found' && selectedCategory === 'consulting' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[11px] font-medium">
                            New vehicle (saved when the loan is submitted)
                          </span>
                        )}
                        {availability.state === 'in_use' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-destructive/10 text-destructive text-[11px] font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            Vehicle already in use
                          </span>
                        )}
                        {availability.state === 'unavailable' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-destructive/10 text-destructive text-[11px] font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            Registration number belongs to another record
                          </span>
                        )}
                        {availability.conflicts && availability.conflicts.length > 0 && (
                          <p className="text-destructive text-[11px] mt-1">
                            • Conflict on {availability.conflicts.join(' & ')} with an existing vehicle.
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-1 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Reg No:</span>{' '}
                        <span className="font-medium">{mappedOcr.vehicle.vehicleNumber || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Vehicle:</span>{' '}
                        <span className="font-medium">{mappedOcr.vehicle.vehicleName || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Year / Color:</span>{' '}
                        <span className="font-medium">
                          {[mappedOcr.vehicle.vehicle_modal, mappedOcr.vehicle.color].filter(Boolean).join(' / ') ||
                            '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type:</span>{' '}
                        <span className="font-medium">{mappedOcr.vehicle.type || '—'}</span>
                      </div>
                      {mappedOcr.warnings
                        .filter((w) => w.section === 'vehicle')
                        .map((w, i) => (
                          <p key={i} className="text-amber-600 dark:text-amber-400">
                            • {w.message}
                          </p>
                        ))}
                    </div>
                  </div>

                  {/* Loan Section */}
                  <div className="p-3 rounded-xl border border-border bg-background space-y-2">
                    <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                      <span className="font-semibold text-foreground">3. Loan</span>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                        <input
                          type="checkbox"
                          checked={sectionsEnabled.loan}
                          onChange={(e) => setSectionsEnabled((p) => ({ ...p, loan: e.target.checked }))}
                        />
                        <span>Apply</span>
                      </label>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">HP Amount:</span>{' '}
                        <span className="font-medium">
                          {mappedOcr.loan.hpAmount !== undefined
                            ? `₹${Number(mappedOcr.loan.hpAmount).toLocaleString('en-IN')}`
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Due:</span>{' '}
                        <span className="font-medium">
                          {mappedOcr.loan.dueAmount !== undefined
                            ? `₹${Number(mappedOcr.loan.dueAmount).toLocaleString('en-IN')}`
                            : '—'}{' '}
                          × {mappedOcr.loan.dueMonth || '—'} mo
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">HP Date / Due Date:</span>{' '}
                        <span className="font-medium">
                          {mappedOcr.loan.hpDate || '—'} / {mappedOcr.loan.due_date || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Interest Rate:</span>{' '}
                        <span className="font-medium">
                          {mappedOcr.loan.interestRate !== undefined ? `${mappedOcr.loan.interestRate}%` : '—'}
                        </span>
                      </div>
                      {mappedOcr.warnings
                        .filter((w) => w.section === 'loan')
                        .map((w, i) => (
                          <p key={i} className="text-amber-600 dark:text-amber-400">
                            • {w.message}
                          </p>
                        ))}
                    </div>
                  </div>

                  {/* Guardian Section */}
                  <div className="p-3 rounded-xl border border-border bg-background space-y-2">
                    <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                      <span className="font-semibold text-foreground">4. Guardian</span>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                        <input
                          type="checkbox"
                          checked={sectionsEnabled.guardian}
                          onChange={(e) =>
                            setSectionsEnabled((p) => ({ ...p, guardian: e.target.checked }))
                          }
                        />
                        <span>Apply</span>
                      </label>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Name:</span>{' '}
                        <span className="font-medium">{mappedOcr.guardian.gname || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Relation:</span>{' '}
                        <span className="font-medium">
                          {mappedOcr.guardian.gfname
                            ? `${mappedOcr.guardian.gfname.unit} ${mappedOcr.guardian.gfname.value}`
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Phones:</span>{' '}
                        <span className="font-medium">
                          {mappedOcr.guardian.gcontacts?.map((c) => c.number).join(', ') || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Address:</span>{' '}
                        <span className="font-medium">
                          {mappedOcr.guardian.gaddress?.address ||
                            [
                              mappedOcr.guardian.gaddress?.house_no,
                              mappedOcr.guardian.gaddress?.street_name,
                              mappedOcr.guardian.gaddress?.village,
                              mappedOcr.guardian.gaddress?.city,
                            ]
                              .filter(Boolean)
                              .join(', ') ||
                            '—'}
                        </span>
                      </div>
                      {mappedOcr.warnings
                        .filter((w) => w.section === 'guardian')
                        .map((w, i) => (
                          <p key={i} className="text-amber-600 dark:text-amber-400">
                            • {w.message}
                          </p>
                        ))}
                    </div>
                  </div>
                </div>

                {/* Apply Policy Options */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 px-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyHplno}
                      onChange={(e) => setApplyHplno(e.target.checked)}
                    />
                    <span>
                      Apply HPL Number{' '}
                      {storeCustomer.hplno?.trim() ? `(current: ${storeCustomer.hplno})` : ''}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overwriteFilled}
                      onChange={(e) => setOverwriteFilled(e.target.checked)}
                    />
                    <span>Overwrite filled fields</span>
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        {stage !== 'scanning' && (
          <DialogFooter className="pt-2 border-t border-border/50 flex flex-row items-center justify-end gap-2 shrink-0">
            {stage === 'upload' && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDialogClose(false)}
                  className="text-xs h-8 px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => startScan(false)}
                  disabled={selectedFiles.length === 0}
                  className="text-xs h-8 px-4 bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1.5 shadow-xs"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  <span>Start AI Scan</span>
                </Button>
              </>
            )}

            {stage === 'error' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDialogClose(false)}
                className="text-xs h-8 px-4"
              >
                Close
              </Button>
            )}

            {stage === 'review' && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDialogClose(false)}
                  className="text-xs h-8 px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyToForm}
                  className="text-xs h-8 px-4 bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1.5 shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Apply to Form</span>
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
