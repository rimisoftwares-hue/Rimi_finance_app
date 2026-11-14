import { MultiStepForm } from '../components/form/MultiStepFormConsultingLoan';
import { FileText } from 'lucide-react';

const Index = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="w-full">
        {/* Header */}
        <header className="text-center flex mb-8 items-center justify-center">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary">
            <FileText className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">
              Consulting Loan Form
            </h1>
            <p className="text-xs text-muted-foreground">
              Complete all steps to submit your application
            </p>
          </div>

        </header>

        {/* Form */}
        <MultiStepForm />
      </div>
    </div>
  );
};

export default Index;
