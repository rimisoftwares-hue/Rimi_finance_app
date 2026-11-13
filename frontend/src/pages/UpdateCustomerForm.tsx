import React, { useState, useEffect } from 'react';
import { PhotoUpload } from './PhotoUpload';
import { ContactFields } from './ContactFields';
import { CustomerFormData } from '../types/customer';
import { calculateEMI } from '../utils/calculations';
import { Save } from 'lucide-react';
import apiClient from '../api/apiClient';
import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { DatePicker } from '../components/ui/date-picker';
import { AppSelect } from '../components/common/AppSelect';

const LOAN_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'close', label: 'Close' },
];

const CUSTOMER_UNIT_OPTIONS = [
  { value: 's/o', label: 'S/O' },
  { value: 'w/o', label: 'W/O' },
  { value: 'h/o', label: 'H/O' },
];

const GUARDIAN_UNIT_OPTIONS = [
  { value: 's/o', label: 'S/O' },
  { value: 'w/o', label: 'W/O' },
  { value: 'h/o', label: 'H/O' },
  { value: 'c/o', label: 'C/O' },
];

const UPDATE_VEHICLE_TYPE_OPTIONS = [
  { value: 'bike', label: 'Bike' },
  { value: 'car', label: 'Car' },
  { value: 'document', label: 'Document' },
];

const UpdateCustomerForm = () => {
  const { hplno } = useParams<{ hplno: string }>();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<CustomerFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [customerPhotoPreview, setCustomerPhotoPreview] = useState<string | null>(null);
  const [customerVehiclePhotoPreview, setCustomerVehiclePhotoPreview] = useState<string | null>(null);
  const [customerPropertyPhotoPreview, setCustomerPropertyPhotoPreview] = useState<string | null>(null);
  const [guardianPhotoPreview, setGuardianPhotoPreview] = useState<string | null>(null);
  const [guardianPropertyPhotoPreview, setGuardianPropertyPhotoPreview] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiClient.get(`/customers/${hplno}`);
        
        if (!response.data) {
          throw new Error('Customer data not found');
        }
        // Initialize form data with the fetched customer data
        const customerData = response.data;
        setFormData({
          customer: {
            hplno: customerData.customer?.hplno || '',
            loanStatus: customerData.loanStatus || 'active', 
            brokerName: customerData.customer?.brokerName || '',
            cname: customerData.customer?.cname || '',
            cphoto: customerData.customer?.cphoto || null,
            cvehiclePhoto: customerData.customer?.cvehiclePhoto || null,
            cpropertyPhoto: customerData.customer?.cpropertyPhoto || null,
            ccontacts: customerData.customer?.contacts?.filter((c: any) => c.contact_type === 'customer') || [],
            caddress: customerData.customer?.caddress || '',
            cfname: {
              value: customerData.customer?.cfname_value || '',
              unit: customerData.customer?.cfname_unit || 's/o'
            }
          },
          guardian: {
            gname: customerData.guardian?.gname || '',
            gphoto: customerData.guardian?.gphoto || null,
            gpropertyPhoto: customerData.guardian?.gpropertyPhoto || null,
            gaddress: customerData.guardian?.gaddress || '',
            gcontacts: customerData.customer?.contacts?.filter((c: any) => c.contact_type === 'guardian') || [],
            gfname: {
              value: customerData.guardian?.gfname_value || '',
              unit: customerData.guardian?.gfname_unit || 's/o'
            }
          },
          loan: {
            hpAmount: customerData.loan?.hpAmount || 0,
            hpDate: customerData.loan?.hpDate ? new Date(customerData.loan.hpDate).toISOString().split('T')[0] :'',
            dueMonth: customerData.loan?.dueMonth || 0,
            interestRate: customerData.loan?.interestRate || 0,
            dueAmount: customerData.loan?.dueAmount || 0,
            penaltyAmount : customerData.loan?.penaltyAmount || 0
          },
          vehicle: {
            vehicleNumber: customerData.vehicle?.vehicleNumber || '',
            modelName: customerData.vehicle?.modelName || '',
            vehicleName: customerData.vehicle?.vehicleName || '',
            type: customerData.vehicle?.type || 'bike',
            color: customerData.vehicle?.color || ''
          },
          payment: customerData.payment || {
            id: 0,
            dueDate: '',
            paymentDate: '',
            billNumber: '',
            amount: 0,
            penalty: 0
          }
        });
        // Set photo previews if they exist
        if (customerData.customer?.cphoto) {
          setCustomerPhotoPreview(customerData.customer.cphoto);
        }
        if (customerData.customer?.cvehiclePhoto) {
          setCustomerVehiclePhotoPreview(customerData.customer.cvehiclePhoto);
        }
        if (customerData.customer?.cpropertyPhoto) {
          setCustomerPropertyPhotoPreview(customerData.customer.cpropertyPhoto);
        }
        if (customerData.guardian?.gphoto) {
          setGuardianPhotoPreview(customerData.guardian.gphoto);
        }
        if (customerData.guardian?.gpropertyPhoto) {
          setGuardianPropertyPhotoPreview(customerData.guardian.gpropertyPhoto);
        }

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load customer data';
        setError(errorMessage);
        console.error('Error fetching customer:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCustomer();
  }, [hplno]);
  useEffect(() => {
    if (!formData) return;
    
    const { hpAmount, interestRate, dueMonth } = formData.loan;
    const emi = calculateEMI(hpAmount, interestRate, dueMonth);
    
    setFormData({
      ...formData,
      loan: { ...formData.loan, dueAmount: emi }
    });
  }, [formData?.loan.hpAmount, formData?.loan.interestRate, formData?.loan.dueMonth]);
  const handleCustomerPhotoChange = (file: File) => {
    if (!formData) return;
    setFormData({
      ...formData,
      customer: { 
        ...formData.customer, 
        cphoto: file 
      }
    });
    setCustomerPhotoPreview(URL.createObjectURL(file));
  };
  const handleCustomerVehiclePhotoChange = (file: File) => {
    if (!formData) return;
    setFormData({
      ...formData,
      customer: { 
        ...formData.customer, 
        cvehiclePhoto: file 
      }
    });
    setCustomerVehiclePhotoPreview(URL.createObjectURL(file));
  };
  const handleCustomerPropertyPhotoChange = (file: File) => {
    if (!formData) return;
    setFormData({
      ...formData,
      customer: { 
        ...formData.customer, 
        cpropertyPhoto: file 
      }
    });
    setCustomerPropertyPhotoPreview(URL.createObjectURL(file));
  };
  
  const handleGuardianPhotoChange = (file: File) => {
    if (!formData) return;
    setFormData({
      ...formData,
      guardian: { 
        ...formData.guardian, 
        gphoto: file 
      }
    });
    setGuardianPhotoPreview(URL.createObjectURL(file));
  };
  const handleGuardianPropertyPhotoChange = (file: File) => {
    if (!formData) return;
    setFormData({
      ...formData,
      guardian: { 
        ...formData.guardian, 
        gpropertyPhoto: file 
      }
    });
    setGuardianPropertyPhotoPreview(URL.createObjectURL(file));
  };
  //handleSubmit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;
    
    try {
      setLoading(true);
      const formDataToSend = new FormData();

      // Prepare customer data with correct field names
      const customerData = {
        hplno: formData.customer.hplno || 'Name',
        loanStatus: formData.customer.loanStatus,
        brokerName: formData.customer.brokerName,
        cname: formData.customer.cname,
        caddress: formData.customer.caddress,
        cfname: {  // Keep the nested structure
          value: formData.customer.cfname.value,
          unit: formData.customer.cfname.unit
        },
        ccontacts: formData.customer.ccontacts
      };
      // Prepare guardian data
      const guardianData = {
        gname: formData.guardian.gname || 'Name',
        gaddress: formData.guardian.gaddress,
        gfname: {  // Keep the nested structure
          value: formData.guardian.gfname.value,
          unit: formData.guardian.gfname.unit
        },
        gcontacts: formData.guardian.gcontacts
      };
      const loanData = {
        hpAmount: formData.loan.hpAmount,
        hpDate: formData.loan.hpDate ? 
          new Date(formData.loan.hpDate).toISOString().split('T')[0] : 
          '',
        dueMonth: formData.loan.dueMonth,
        interestRate: formData.loan.interestRate,
        dueAmount: formData.loan.dueAmount,
        penaltyAmount : formData.loan.penaltyAmount
      };
      // Ensure we're using the correct field names
      formDataToSend.append('customer', JSON.stringify(customerData));
      formDataToSend.append('guardian', JSON.stringify(guardianData));
      formDataToSend.append('loan', JSON.stringify(loanData));
      formDataToSend.append('vehicle', JSON.stringify(formData.vehicle));
      //formDataToSend.append('payment', JSON.stringify(paymentData));

      // Handle customer photo - either new file or existing URL
      if (formData.customer.cphoto instanceof File) {
        formDataToSend.append('customerPhoto', formData.customer.cphoto);
      } else if (typeof formData.customer.cphoto === 'string') {
        formDataToSend.append('customerPhotoUrl', formData.customer.cphoto);
      }
      if (formData.customer.cvehiclePhoto instanceof File) {
        formDataToSend.append('customerVehiclePhoto', formData.customer.cvehiclePhoto);
      } else if (typeof formData.customer.cvehiclePhoto === 'string') {
        formDataToSend.append('customerVehiclePhotoUrl', formData.customer.cvehiclePhoto);
      }
      if (formData.customer.cpropertyPhoto instanceof File) {
        formDataToSend.append('customerPropertyPhoto', formData.customer.cpropertyPhoto);
      } else if (typeof formData.customer.cpropertyPhoto === 'string') {
        formDataToSend.append('customerPropertyPhotoUrl', formData.customer.cpropertyPhoto);
      }
      // Handle guardian photo - either new file or existing URL
      if (formData.guardian.gphoto instanceof File) {
        formDataToSend.append('guardianPhoto', formData.guardian.gphoto);
      } 
      // else if (typeof formData.guardian.gphoto === 'string') {
      //   formDataToSend.append('guardianPhotoUrl', formData.guardian.gphoto);
      // }
      if (formData.guardian.gpropertyPhoto instanceof File) {
        formDataToSend.append('guardianPropertyPhoto', formData.guardian.gpropertyPhoto);
      } 
      // else if (typeof formData.guardian.gpropertyPhoto === 'string') {
      //   formDataToSend.append('guardianPropertyPhotoUrl', formData.guardian.gpropertyPhoto);
      // }

      const response = await apiClient.put(
        `/customers/${hplno}`,
        formDataToSend
      );

      if (response.data.success) {
        alert('Customer updated successfully!');
        navigate(`/customers/${hplno}`);
      } else {
        alert('Failed to update customer: ' + (response.data.error || 'Unknown error'));
      }
    }catch (err: any) {
      let errorMessage = 'Update failed';
      
      if (err.response) {
        if (err.response.data?.error === 'Only image files are allowed') {
          errorMessage = 'Please upload only image files (JPEG, PNG, etc.)';
        } else if (err.response.data?.error === 'File too large') {
          errorMessage = 'Image must be smaller than 5MB';
        } else {
          errorMessage = err.response.data?.message || err.response.data?.error || 'Unknown error';
        }
      }
      
      alert(errorMessage);
      console.error('Error details:', err);
    }finally {
      setLoading(false);
    }
  };
  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
  
  // Show error if it exists
  if (error) return (
    <div className="p-4 bg-red-100 text-red-700 rounded-md">
      Error: {error}
      <button 
        onClick={() => window.location.reload()}
        className="ml-4 px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700"
      >
        Retry
      </button>
    </div>
  );
  if (!formData) return <div>Customer not found</div>;
  


  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="bg-white p-6 rounded-lg shadow-lg space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Update Customer</h2>

        {/* Customer Details Section */}
        <section className="space-y-6">
          <h3 className="text-lg font-semibold text-gray-700">Customer Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
              <label className="block text-sm font-medium text-gray-700">
                Broker Name 
              </label>
              <input
                type="text"
                placeholder='Broker Name'
                value={formData.customer.brokerName}
                onChange={(e) => {if (!formData) return; setFormData({
                  ...formData,
                    customer: {...formData.customer,brokerName: e.target.value}
                  });
                }}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                HPL No <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder='HPL No'
                required
                value={formData.customer.hplno}
                onChange={(e) => {if (!formData) return; setFormData({
                  ...formData,
                    customer: {...formData.customer,hplno: e.target.value}
                  });
                }}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
            </div>
            <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">Lone Status <span className="text-red-500">*</span></label>
                <AppSelect
                  value={formData.customer.loanStatus}
                  onValueChange={(val) => {if (!formData) return; setFormData({
                    ...formData,
                    customer: { ...formData.customer, loanStatus: val as 'active' | 'close' }
                   });
                  }}
                  options={LOAN_STATUS_OPTIONS}
                  className="mt-1 w-full"
                />
              </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder='Name'
                required
                value={formData.customer.cname}
                onChange={(e) => {if (!formData) return; setFormData({
                  ...formData,
                  customer: { ...formData.customer, cname: e.target.value }
                });
              }}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
            </div>
            <PhotoUpload
              label="Customer Photo"
      
              onChange={(file:File) => handleCustomerPhotoChange(file)}
              preview={customerPhotoPreview}
            />
            <PhotoUpload
              label="Customer Vehicle Photo"
              
              onChange={(file:File) => handleCustomerVehiclePhotoChange(file)}
              preview={customerVehiclePhotoPreview}
            />
            <PhotoUpload
              label="Customer property Photo"
              
              onChange={(file:File) => handleCustomerPropertyPhotoChange(file)}
              preview={customerPropertyPhotoPreview}
            />
            <div className="flex space-x-4">
              <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Unit</label>
                  <AppSelect
                    value={formData.customer.cfname.unit}
                    onValueChange={(val) => {if (!formData) return; setFormData({
                      ...formData,
                      customer: {
                        ...formData.customer,
                        cfname: { ...formData.customer.cfname, unit: val as 's/o' | 'w/o' | 'h/o' }
                      }
                    });}}
                    options={CUSTOMER_UNIT_OPTIONS}
                    className="mt-1 w-full"
                  />
                </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">
                Customer Fname
                </label>
                <input
                  type="text"
                  placeholder='Name'
                  value={formData.customer.cfname.value}
                  onChange={(e) => {if (!formData) return; setFormData({
                    ...formData,
                    customer: {
                      ...formData.customer,
                      cfname: { ...formData.customer.cfname, value: e.target.value }
                    }
                  });}}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                />
              </div>
              
            </div>
            <div className="col-span-2">
              <ContactFields
                contacts={formData.customer.ccontacts || []}
                onChange={(ccontacts) => {if (!formData) return; setFormData({
                  ...formData,
                  customer: { ...formData.customer, ccontacts }
                });}}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Address <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                placeholder='Address'
                value={formData.customer.caddress}
                onChange={(e) => {if (!formData) return; setFormData({
                  ...formData,
                  customer: { ...formData.customer, caddress: e.target.value }
                });}}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
            </div>
          </div>
        </section>

        {/* Guardian Details Section */}
        <section className="space-y-6">
          <h3 className="text-lg font-semibold text-gray-700">Guardian Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Guardian Name
              </label>
              <input
                type="text"
                placeholder='Name'
                value={formData.guardian.gname}
                onChange={(e) => {if (!formData) return; setFormData({
                  ...formData,
                  guardian: { ...formData.guardian, gname: e.target.value }
                });}}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
            </div>
            <PhotoUpload
              label="Guardian Photo"
              
              onChange={(file:File) => handleGuardianPhotoChange(file)}
              preview={guardianPhotoPreview}
            />
            <PhotoUpload
              label="Guardian Property Photo"
              
              onChange={(file:File) => handleGuardianPropertyPhotoChange(file)}
              preview={guardianPropertyPhotoPreview}
            />
            <div className="flex space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">Unit</label>
                <AppSelect
                  value={formData.guardian.gfname.unit}
                  onValueChange={(val) => {if (!formData) return; setFormData({
                    ...formData,
                    guardian: {
                      ...formData.guardian,
                      gfname: { ...formData.guardian.gfname, unit: val as 's/o' | 'w/o' | 'h/o' | 'c/o'}
                    }
                  });}}
                  options={GUARDIAN_UNIT_OPTIONS}
                  className="mt-1 w-full"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">
                  Guardian Fname 
                </label>
                <input
                  type="text"
                  placeholder='Name'
                  value={formData.guardian.gfname.value}
                  onChange={(e) => {if (!formData) return; setFormData({
                    ...formData,
                    guardian: {
                      ...formData.guardian,
                      gfname: { ...formData.guardian.gfname, value: e.target.value }
                    }
                  });}}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                />
              </div>
              
            </div>
            <div className="col-span-2">
              <ContactFields
                contacts={formData.guardian.gcontacts || []}
                onChange={(gcontacts) => {if (!formData) return; setFormData({
                  ...formData,
                  guardian: { ...formData.guardian, gcontacts }
                });}}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Guardian Address 
              </label>
              <textarea
                placeholder='Address'
                value={formData.guardian.gaddress}
                onChange={(e) => {if (!formData) return; setFormData({
                  ...formData,
                  guardian: { ...formData.guardian, gaddress: e.target.value }
                });}}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
            </div>
          </div>
        </section>

        {/* Loan Details Section */}
        <section className="space-y-6">
          <h3 className="text-lg font-semibold text-gray-700">Loan Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                HP Amount <span className="text-red-500">*</span>
              </label>
              
              <input
                type="number"
                placeholder='0000'
                required
                min="0"
                value={formData.loan.hpAmount || ''}
                onChange={(e) => {if (!formData) return; setFormData({
                  ...formData,
                  loan: { ...formData.loan, hpAmount: Number(e.target.value) }
                });}}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                HP Date <span className="text-red-500">*</span>
              </label>
              <DatePicker
                required
                value={formData.loan.hpDate ? new Date(formData.loan.hpDate).toISOString().split('T')[0] : ''}
                onChange={(e) => {
                  if (!formData || !e.target.value) return;
                  const date = new Date(e.target.value);
                  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
                  setFormData({
                    ...formData,
                    loan: { ...formData.loan, hpDate: utcDate.toISOString().split('T')[0] }
                  });
                }}
                className="mt-1"
              />
            </div>
            <div className="flex space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">
                  Duration <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  placeholder='0'
                  required
                  min="1"
                  value={formData.loan.dueMonth || ''}
                  onChange={(e) => {if (!formData) return; setFormData({
                    ...formData,
                    loan: { 
                      ...formData.loan, 
                      dueMonth: Number(e.target.value) 
                    }
                  });}}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Interest Rate (%) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                placeholder='0'
                required
                min="0"
                step="0.01"
                value={formData.loan.interestRate || ''}
                onChange={(e) => {if (!formData) return; setFormData({
                  ...formData,
                  loan: { ...formData.loan, interestRate: Number(e.target.value) }
                });}}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Due Amount</label>
              <input
                type="number"
                readOnly
                value={formData.loan.dueAmount}
                className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Penalty Amount
              </label>
              
              <input
                type="number"
                placeholder='00'
                min="0"
                value={formData.loan.penaltyAmount || ''}
                onChange={(e) => {if (!formData) return; setFormData({
                  ...formData,
                  loan: { ...formData.loan, penaltyAmount: Number(e.target.value) }
                });}}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
            </div>
          </div>
        </section>

        {/* Vehicle Details Section */}
        <section className="space-y-6">
          <h3 className="text-lg font-semibold text-gray-700">Vehicle Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Vehicle Number 
              </label>
              <input
                type="text"
                placeholder='TN 39 AA 0000'
                value={formData.vehicle.vehicleNumber}
                onChange={(e) => {if (!formData) return; setFormData({
                  ...formData,
                  vehicle: { ...formData.vehicle, vehicleNumber: e.target.value }
                });}}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Vehicle Model 
              </label>
              <input
                type="text"
                placeholder='Modal'
                value={formData.vehicle.modelName}
                onChange={(e) => {if (!formData) return; setFormData({
                  ...formData,
                  vehicle: { ...formData.vehicle, modelName: e.target.value }
                });}}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Vehicle Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder='Vehicle Name'
                required
                value={formData.vehicle.vehicleName}
                onChange={(e) => {if (!formData) return; setFormData({
                  ...formData,
                  vehicle: { ...formData.vehicle, vehicleName: e.target.value }
                });}}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Vehicle Type <span className="text-red-500">*</span>
              </label>
              <AppSelect
                value={formData.vehicle.type}
                onValueChange={(val) => {if (!formData) return; setFormData({
                  ...formData,
                  vehicle: { ...formData.vehicle, type: val as 'bike' | 'car' | 'document' }
                });}}
                options={UPDATE_VEHICLE_TYPE_OPTIONS}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Vehicle Color
              </label>
              <input
                type="text"
                placeholder='Color'
                value={formData.vehicle.color}
                onChange={(e) => {if (!formData) return; setFormData({
                  ...formData,
                  vehicle: { ...formData.vehicle, color: e.target.value }
                });}}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-6">
          <button
            type="submit"
            className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Save className="w-5 h-5 mr-2" />
            update Customer
          </button>
        </div>
      </div>
    </form>
  );
};
export default UpdateCustomerForm;