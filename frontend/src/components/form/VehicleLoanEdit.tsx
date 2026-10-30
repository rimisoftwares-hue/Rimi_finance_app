
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MultiStepFormEdit } from './MultiStepFormEdit';
import { toast } from '../../hooks/use-toast';
import apiClient from '../../api/apiClient';
import { Loader2 } from 'lucide-react';
import { normalizeCustomerData } from '../../utils/normalizeCustomer';

const VehicleLoanEdit = () => {
  const { hplno } = useParams<{ hplno: string }>();
  const navigate = useNavigate();
  const [initialData, setInitialData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    const fetchCustomerData = async () => {
      try {
        setLoading(true);
        setInitialData(null);
        const response = await apiClient.get(`/customers/${hplno}`);
        
        if (!isCurrent) return;

        if (!response.data || !response.data.customer) {
          throw new Error('Customer not found');
        }

        const transformedData = normalizeCustomerData(response.data);
        setInitialData(transformedData);
      } catch (error) {
        if (!isCurrent) return;
        console.error('Error fetching customer data:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load customer data',
        });
        navigate('/');
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
  }, [hplno, navigate]);


  const handleSubmit = async (formData: any) => {
    setIsSubmitting(true);
    try {
      const submitData = new FormData();

      // Prepare customer data
      const customerData = {
        hplno: formData.customer.hplno,
        loanStatus: formData.customer.loanStatus,
        brokerName: formData.customer.brokerName,
        cname: formData.customer.cname,
        cfname: {
          value: formData.customer.cfname.value,
          unit: formData.customer.cfname.unit
        },
        aadhar_id: formData.customer.aadhar_id,
        other_govt_id_type: formData.customer.other_govt_id_type,
        other_govt_id_number: formData.customer.other_govt_id_number,
        profession: formData.customer.profession,
        work_office_address: formData.customer.work_office_address,
        work_office_phone: formData.customer.work_office_phone,
        ccontacts: formData.customer.ccontacts,
        caddress: formData.customer.caddress
      };
      submitData.append('customer', JSON.stringify(customerData));

      // Prepare guardian data
      if (formData.guardian) {
        const guardianData = {
          gname: formData.guardian.gname,
          gfname: {
            value: formData.guardian.gfname.value,
            unit: formData.guardian.gfname.unit
          },
          aadhar_id: formData.guardian.aadhar_id,
          other_govt_id_type: formData.guardian.other_govt_id_type,
          other_govt_id_number: formData.guardian.other_govt_id_number,
          profession: formData.guardian.profession,
          remarks: formData.guardian.remarks,
          work_office_address: formData.guardian.work_office_address,
          work_office_phone: formData.guardian.work_office_phone,
          gcontacts: formData.guardian.gcontacts,
          gaddress: formData.guardian.gaddress
        };
        submitData.append('guardian', JSON.stringify(guardianData));
      }

      // Prepare loan data
      if (formData.loan) {
        const loanData = {
          loan_type: formData.loan.loan_type,
          hpAmount: formData.loan.hpAmount,
          hpDate: formData.loan.hpDate,
          due_date: formData.loan.due_date,
          dueMonth: formData.loan.dueMonth,
          interestRate: formData.loan.interestRate,
          penaltyAmount: formData.loan.penaltyAmount,
          penalty_days: formData.loan.penalty_days,
          principle_part: formData.loan.principle_part,
          interest_part: formData.loan.interest_part,
          dueAmount: formData.loan.dueAmount,
          down_payment: formData.loan.down_payment,
          pay_mode: formData.loan.pay_mode,
          net_payment: formData.loan.net_payment,
          net_payable: formData.loan.net_payable,
          pay_mode_1: formData.loan.pay_mode_1,
          pay_mode_1_amount: formData.loan.pay_mode_1_amount,
          hand_loan: formData.loan.hand_loan,
          hand_loan_remarks: formData.loan.hand_loan_remarks,
          broker_name: formData.loan.broker_name,
          dealer_name: formData.loan.dealer_name,
          documentation_charge: formData.loan.documentation_charge,
          broker_commission: formData.loan.broker_commission,
          remarks: formData.loan.remarks
        };
        submitData.append('loan', JSON.stringify(loanData));
      }

      // Prepare vehicle data with all required fields
      if (formData.vehicle) {
        const vehicleData = {
          id: formData.vehicle.id,
          vehicle_info_id: formData.vehicle.vehicle_info_id?.trim() || null,
          brand: formData.vehicle.brand || '',
          model_name: formData.vehicle.model_name || formData.vehicle.modelName || '',
          vehicle_name: formData.vehicle.vehicleName || formData.vehicle.modelName || '',
          vehicle_number: formData.vehicle.vehicleNumber,
          vehicle_modal: (formData.vehicle.vehicleModal || formData.vehicle.modelName || formData.vehicle.model_name || '').slice(0, 10),
          chassis_number: formData.vehicle.chassis_number && formData.vehicle.chassis_number.trim() ? formData.vehicle.chassis_number.trim() : null,
          engine_number: formData.vehicle.engine_number && formData.vehicle.engine_number.trim() ? formData.vehicle.engine_number.trim() : null,
          selling_price: formData.vehicle.selling_price || formData.loan.hpAmount || 0,
          emi_from: formData.vehicle.emi_from || formData.loan.dueAmount || 0,
          base_price: formData.vehicle.base_price || 0,
          status: 'sales',
          deal_type: 'finance',
          rc_holder: formData.vehicle.rc_holder || 'pending',
          rc_status: formData.vehicle.rc_status || 'not_available',
          remarks: formData.vehicle.remarks || '',
          color: formData.vehicle.color || '', // Add vehicle color
          variant: formData.vehicle.variant || '',
        };
        submitData.append('vehicle', JSON.stringify(vehicleData));
      }

      // Append image files if they are new files (not strings)
      if (formData.customer.cphoto instanceof File) {
        submitData.append('customerPhoto', formData.customer.cphoto);
      }
      if (formData.customer.cvehiclePhoto instanceof File) {
        submitData.append('customerVehiclePhoto', formData.customer.cvehiclePhoto);
      }
      if (formData.customer.cpropertyPhoto instanceof File) {
        submitData.append('customerPropertyPhoto', formData.customer.cpropertyPhoto);
      }
      if (formData.guardian?.gphoto instanceof File) {
        submitData.append('guardianPhoto', formData.guardian.gphoto);
      }
      if (formData.guardian?.gpropertyPhoto instanceof File) {
        submitData.append('guardianPropertyPhoto', formData.guardian.gpropertyPhoto);
      }
      const response = await apiClient.put(
        `/customers/finance/${initialData.customer.id}`,
        submitData
      );

      if (response.data.success) {
        toast({
          title: 'Success',
          description: 'Customer updated successfully',
        });
        
        navigate(`/customers/${initialData.customer.id}`);
        console.log('formData.customer.hplno:',initialData.customer.id)
        console.log('response.data body:', response.data);
      } else {
        throw new Error(response.data.error || 'Failed to update customer');
      }
    } catch (error: any) {
      console.error('Error updating customer:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || error.message || 'Failed to update customer',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading customer data...</span>
      </div>
    );
  }

  if (!initialData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">No customer data found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <MultiStepFormEdit
        key={initialData?.customer?.id || hplno}
        initialData={initialData}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};

export default VehicleLoanEdit;