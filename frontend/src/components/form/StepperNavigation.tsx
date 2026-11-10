import React from 'react';
import { cn } from '../lib/utils';
import { Check, User, Car, Shield } from 'lucide-react';
import { useFormStore } from '../../types/formStore';

interface Step {
  id: number;
  title: string;
  icon: React.ReactNode;
}

const steps: Step[] = [
  { id: 1, title: 'Customer', icon: <User className="w-5 h-5" /> },
  { id: 2, title: 'Vehicle & Loan', icon: <Car className="w-5 h-5" /> },
  { id: 3, title: 'Guardian', icon: <Shield className="w-5 h-5" /> },
];

interface StepperNavigationProps {
  onStepClick: (step: number) => void;
  canNavigateToStep: (step: number) => boolean;
  align?: 'left' | 'center';
}

export const StepperNavigation: React.FC<StepperNavigationProps> = ({
  onStepClick,
  canNavigateToStep,
  align = 'center',
}) => {
  const { currentStep, completedSteps } = useFormStore();

  // return (
  //   <nav className="w-full mb-8">
  //     <ol className="flex items-center justify-center gap-2 sm:gap-4">
  //       {steps.map((step, index) => {
  //         const isCompleted = completedSteps.includes(step.id);
  //         const isActive = currentStep === step.id;
  //         const isClickable = canNavigateToStep(step.id);

  //         return (
  //           <li key={step.id} className="flex items-center">
  //             <button
  //               type="button"
  //               onClick={() => isClickable && onStepClick(step.id)}
  //               disabled={!isClickable}
  //               className={cn(
  //                 'flex flex-col sm:flex-row items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl transition-all duration-300',
  //                 isClickable && 'cursor-pointer hover:bg-accent',
  //                 !isClickable && 'cursor-not-allowed opacity-60'
  //               )}
  //             >
  //               <div
  //                 className={cn(
  //                   'flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all duration-300',
  //                   isCompleted && 'bg-step-completed text-success-foreground',
  //                   isActive && !isCompleted && 'bg-step-active text-primary-foreground ring-4 ring-primary/20',
  //                   !isActive && !isCompleted && 'bg-muted text-muted-foreground'
  //                 )}
  //               >
  //                 {isCompleted ? (
  //                   <Check className="w-5 h-5 sm:w-6 sm:h-6" />
  //                 ) : (
  //                   step.icon
  //                 )}
  //               </div>
  //               <div className="text-center sm:text-left">
  //                 <p
  //                   className={cn(
  //                     'text-xs sm:text-sm font-medium transition-colors',
  //                     isActive && 'text-primary',
  //                     isCompleted && 'text-step-completed',
  //                     !isActive && !isCompleted && 'text-muted-foreground'
  //                   )}
  //                 >
  //                   Step {step.id}
  //                 </p>
  //                 <p
  //                   className={cn(
  //                     'text-sm sm:text-base font-semibold transition-colors',
  //                     isActive && 'text-foreground',
  //                     isCompleted && 'text-foreground',
  //                     !isActive && !isCompleted && 'text-muted-foreground'
  //                   )}
  //                 >
  //                   {step.title}
  //                 </p>
  //               </div>
  //             </button>

  //             {index < steps.length - 1 && (
  //               <div
  //                 className={cn(
  //                   'hidden sm:block w-12 lg:w-20 h-1 mx-2 rounded-full transition-colors duration-300',
  //                   completedSteps.includes(step.id)
  //                     ? 'bg-step-completed'
  //                     : 'bg-border'
  //                 )}
  //               />
  //             )}
  //           </li>
  //         );
  //       })}
  //     </ol>
  //   </nav>
  // );
  return (
  <nav className="w-full">
    <ol className={cn(
      "flex items-center gap-2 sm:gap-4 w-full overflow-x-auto py-1",
      align === 'left' ? "justify-start" : "justify-center"
    )}>
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id);
        const isActive = currentStep === step.id;
        const isClickable = canNavigateToStep(step.id);

        return (
          <li key={step.id} className="flex items-center">
            <button
              type="button"
              onClick={() => isClickable && onStepClick(step.id)}
              disabled={!isClickable}
              className={cn(
                "flex flex-col sm:flex-row items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl transition-all duration-300",
                isClickable && "cursor-pointer hover:bg-[#e4f0ff]",
                !isClickable && "cursor-not-allowed opacity-60"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all duration-300",
                  isCompleted && "bg-[#27C17A] text-white",
                  isActive &&
                    !isCompleted &&
                    "bg-[#1E66FF] text-white ring-4 ring-[#1E66FF]/20",
                  !isActive && !isCompleted && "bg-[#F3F5F9] text-[#6F7B92]"
                )}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5 sm:w-6 sm:h-6" />
                ) : (
                  step.icon
                )}
              </div>

              <div className="text-center sm:text-left">
                <p
                  className={cn(
                    "text-xs sm:text-sm font-medium transition-colors",
                    isActive && "text-[#1E66FF]",
                    isCompleted && "text-[#27C17A]",
                    !isActive && !isCompleted && "text-[#6F7B92]"
                  )}
                >
                  Step {step.id}
                </p>

                <p
                  className={cn(
                    "text-sm sm:text-base font-semibold transition-colors",
                    (isActive || isCompleted) && "text-[#1E2433]",
                    !isActive && !isCompleted && "text-[#6F7B92]"
                  )}
                >
                  {step.title}
                </p>
              </div>
            </button>

            {index < steps.length - 1 && (
              <div
                className={cn(
                  "hidden sm:block w-12 lg:w-20 h-1 mx-2 rounded-full transition-colors duration-300",
                  completedSteps.includes(step.id)
                    ? "bg-[#27C17A]"
                    : "bg-[#DDE3EB]"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  </nav>
);

};
