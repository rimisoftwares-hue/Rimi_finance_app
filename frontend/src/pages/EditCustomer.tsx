import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, User } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { toast } from '../hooks/use-toast';
import axios from 'axios';
import apiClient from '../api/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { MultiStepFormEdit } from '../components/form/MultiStepFormEdit';

const EditCustomer = () => {
  const navigate = useNavigate();
  const { hplno } = useParams<{ hplno: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerData, setCustomerData] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    const fetchCustomerData = async () => {
      try {
        setLoading(true);
        setError(null);
        setCustomerData(null);
        const response = await apiClient.get(`/customers/${hplno}`);
        
        if (!isCurrent) return;

        if (!response.data || !response.data.customer) {
          throw new Error('Customer not found');
        }
        
        setCustomerData(response.data);
      } catch (err) {
        if (!isCurrent) return;
        let errorMessage = 'Failed to load customer data';
        
        if (axios.isAxiosError(err)) {
          errorMessage = err.response?.data?.error || err.message;
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }
        
        setError(errorMessage);
        console.error('Error fetching customer:', errorMessage);
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    };
    
    if (hplno) {
      fetchCustomerData();
    }

    return () => {
      isCurrent = false;
    };
  }, [hplno]);

  const handleSubmit = async (formData: any) => {
    if (!user?.role || user.role !== 'owner') {
      toast({
        variant: 'destructive',
        title: 'Permission Denied',
        description: 'Only owners can edit customer details.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('financeToken');
      
      // Prepare form data with files
      const submitData = new FormData();
      
      // Add all customer data
      submitData.append('customer', JSON.stringify(formData.customer));
      submitData.append('guardian', JSON.stringify(formData.guardian));
      submitData.append('loan', JSON.stringify(formData.loan));
      submitData.append('vehicle', JSON.stringify(formData.vehicle));
      
      // Append files if they exist (only if they're new files, not URLs)
      if (formData.customer.cphoto instanceof File) {
        submitData.append('customerPhoto', formData.customer.cphoto);
      }
      if (formData.customer.cvehiclePhoto instanceof File) {
        submitData.append('customerVehiclePhoto', formData.customer.cvehiclePhoto);
      }
      if (formData.customer.cpropertyPhoto instanceof File) {
        submitData.append('customerPropertyPhoto', formData.customer.cpropertyPhoto);
      }
      if (formData.guardian.gphoto instanceof File) {
        submitData.append('guardianPhoto', formData.guardian.gphoto);
      }
      if (formData.guardian.gpropertyPhoto instanceof File) {
        submitData.append('guardianPropertyPhoto', formData.guardian.gpropertyPhoto);
      }

      const response = await apiClient.put(
        `/customers/${hplno}`,
        submitData
      );

      if (response.data.success) {
        toast({
          title: 'Success!',
          description: 'Customer details updated successfully.',
        });
        navigate(`/customers/${hplno}`);
      } else {
        throw new Error(response.data.error || 'Failed to update customer');
      }
    } catch (err) {
      console.error('Error updating customer:', err);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: err instanceof Error ? err.message : 'Failed to update customer details.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading customer data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-destructive mb-4">
            <User className="w-12 h-12 mx-auto" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Error Loading Customer</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => navigate('/customers')}>
            Back to Customers
          </Button>
        </div>
      </div>
    );
  }

  if (!customerData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-muted-foreground mb-4">
            <User className="w-12 h-12 mx-auto" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Customer Not Found</h3>
          <p className="text-muted-foreground mb-4">The customer you're trying to edit doesn't exist.</p>
          <Button onClick={() => navigate('/customers')}>
            Back to Customers
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <User className="w-6 h-6" />
              Edit Customer: {customerData.customer.cname}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              HPL No: {hplno} • Last updated: {new Date(customerData.customer.created_at).toLocaleDateString()}
            </p>
          </div>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate(`/customers/${hplno}`)}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Cancel
            </Button>
            <Button
              onClick={() => document.getElementById('edit-form-submit')?.click()}
              disabled={isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-card rounded-xl border shadow-sm">
          <MultiStepFormEdit
            key={customerData.customer?.id || hplno}
            initialData={customerData}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </div>

        {/* Footer */}
        <div className="mt-6 pt-6 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-sm text-muted-foreground">
            <p>Editing customer details will update all associated records.</p>
            <p className="mt-1">Make sure to verify all information before saving.</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate(`/customers/${hplno}`)}
            >
              Discard Changes
            </Button>
            <Button
              id="edit-form-submit"
              onClick={() => document.getElementById('edit-form-submit')?.click()}
              disabled={isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Changes
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save All Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditCustomer;