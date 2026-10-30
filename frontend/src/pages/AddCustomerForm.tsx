import React, { useState, useEffect, useRef } from 'react';
import { PhotoUpload } from './PhotoUpload';
import { ContactFields } from './ContactFields';
import { CustomerFormData } from '../types/customer';
import { calculateEMI } from '../utils/calculations';
import { Save } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { DatePicker } from '../components/ui/date-picker';

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');

const AddCustomerForm = ()=> {
  const [formData, setFormData] = useState<CustomerFormData>({
    customer: {
      hplno : '',
      loanStatus : 'active',
      brokerName : '',
      cname: '',
      cphoto: null,
      cvehiclePhoto: null,
      cpropertyPhoto: null,
      ccontacts: [{contact_type:'customer', type: 'mobile', number: '' }],
      caddress: '',
      cfname: { value: '', unit: 's/o' }
    },
    guardian: {
      gname: '',
      gphoto: null,
      gpropertyPhoto: null,
      gaddress: '',
      gcontacts: [{contact_type:'guardian', type: 'mobile', number: '' }],
      gfname: { value: '', unit: 's/o' }
    },
    loan: {
      hpAmount: 0,
      hpDate: '',
      dueMonth: 12,
      interestRate: 0,
      dueAmount: 0,
      penaltyAmount : 0
    },
    payment: {
      id: 0,
      dueDate: '',
      paymentDate: '',
      billNumber: '',
      amount: 0,
      penalty : 0
    },
    vehicle: {
      vehicleNumber: '',
      modelName: '',
      type: 'bike',
      color: '',
      vehicleName:''
    },
  });

  // previews
  const [customerPhotoPreview, setCustomerPhotoPreview] = useState<string | null>(null);
  const [customerVehiclePhotoPreview, setCustomerVehiclePhotoPreview] = useState<string | null>(null);
  const [customerPropertyPhotoPreview, setCustomerPropertyPhotoPreview] = useState<string | null>(null);
  const [guardianPhotoPreview, setGuardianPhotoPreview] = useState<string | null>(null);
  const [guardianPropertyPhotoPreview, setGuardianPropertyPhotoPreview] = useState<string | null>(null);

  const [isChecking, setIsChecking] = useState(false);
  const [duplicateCustomer, setDuplicateCustomer] = useState<any | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const debounceRef = useRef<number | undefined>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    const { hpAmount, interestRate, dueMonth } = formData.loan;
    const emi = calculateEMI(hpAmount, interestRate, dueMonth);

    setFormData(prev => ({
      ...prev,
      loan: { ...prev.loan, dueAmount: emi }
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.loan.hpAmount, formData.loan.interestRate, formData.loan.dueMonth]);

  // Debounced search trigger when key fields change
  useEffect(() => {
    // fields to watch: cname, cfname.value, vehicle.vehicleNumber, first customer contact number
    const vehicleNumber = formData.vehicle.vehicleNumber?.trim();
    const cname = formData.customer.cname?.trim();
    const cfname = formData.customer.cfname?.value?.trim();
    const mobile = formData.customer.ccontacts && formData.customer.ccontacts.length ? formData.customer.ccontacts[0].number.trim() : '';

    // if nothing meaningful, clear duplicate
    if (!cname && !cfname && !vehicleNumber && !mobile) {
      setDuplicateCustomer(null);
      setSearchError(null);
      setIsChecking(false);
      return;
    }

    // debounce 500ms
    setIsChecking(true);
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    // @ts-ignore
    debounceRef.current = window.setTimeout(() => {
      performSearch({ cname, cfname, mobile, vehicleNumber });
    }, 500);

    // cleanup on unmount
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.customer.cname, formData.customer.cfname.value, formData.customer.ccontacts, formData.vehicle.vehicleNumber]);

  const performSearch = async ({ cname, cfname, mobile, vehicleNumber }: { cname?: string, cfname?: string, mobile?: string, vehicleNumber?: string }) => {
    try {
      setSearchError(null);
      setIsChecking(true);
      setDuplicateCustomer(null);

      const params: any = {};
      if (cname) params.cname = cname;
      if (cfname) params.cfname = cfname;
      if (mobile) params.mobile = mobile;
      if (vehicleNumber) params.vehicleNumber = vehicleNumber;

      const query = new URLSearchParams(params).toString();
      const url = `${API_ORIGIN}/customers/search?${query}`;

      const resp = await axios.get(url, { withCredentials: true });

      if (resp.data && resp.data.success && resp.data.found) {
        setDuplicateCustomer(resp.data.customer);
        // alert-ish (inline notification better) — keep as subtle info
        // we will show an inline banner in the UI instead of alert popup
      } else {
        setDuplicateCustomer(null);
      }
    } catch (err: any) {
      console.error('Search error', err);
      setSearchError(err?.response?.data?.message || err?.message || 'Search failed');
      setDuplicateCustomer(null);
    } finally {
      setIsChecking(false);
    }
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (duplicateCustomer) {
      // if duplicate exists, prevent accidental submit
      alert('This customer already exists. Use "Update Instead?" or View Full Profile.');
      return;
    }

    try {
      const formDataToSend = new FormData();

      formDataToSend.append('customer', JSON.stringify(formData.customer));
      formDataToSend.append('guardian', JSON.stringify(formData.guardian));
      formDataToSend.append('loan', JSON.stringify(formData.loan));
      formDataToSend.append('vehicle', JSON.stringify(formData.vehicle));

      if (formData.customer.cphoto) {
        formDataToSend.append('customerPhoto', formData.customer.cphoto);
      }
      if (formData.customer.cvehiclePhoto) {
        formDataToSend.append('customerVehiclePhoto', formData.customer.cvehiclePhoto);
      }
      if (formData.customer.cpropertyPhoto) {
        formDataToSend.append('customerPropertyPhoto', formData.customer.cpropertyPhoto);
      }
      if (formData.guardian.gphoto) {
        formDataToSend.append('guardianPhoto', formData.guardian.gphoto);
      }
      if (formData.guardian.gpropertyPhoto) {
        formDataToSend.append('guardianPropertyPhoto', formData.guardian.gpropertyPhoto);
      }

      const response = await axios.post(`${API_ORIGIN}/customers`, formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        withCredentials: true
      });

      if (response.data.success) {
        alert('Customer added successfully!');
        navigate('/customers');
      } else {
        alert('Failed to add customer: ' + (response.data.error || 'Unknown error'));
      }
    } catch (err: any) {
      let errorMessage = 'Submission failed';
      if (err.response) {
        if (err.response.data?.error === 'Only image files are allowed') {
          errorMessage = 'Please upload only image files (JPEG, PNG, etc.)';
        } else if (err.response.data?.error === 'File too large') {
          errorMessage = 'Image must be smaller than 5MB';
        } else if (err.response.data?.details) {
          errorMessage = err.response.data.details;
        } else {
          errorMessage = err.response.data?.message || err.response.data?.error || 'Unknown error';
        }
      } else if (err.request) {
        errorMessage = 'No response from server';
      } else {
        errorMessage = err.message;
      }
      alert(errorMessage);
      console.error('Error details:', err);
    }
  };

  // image handlers (unchanged)
  const handleCustomerPhotoChange = (file: File) => {
    setFormData(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        cphoto: file
      }
    }));
    setCustomerPhotoPreview(URL.createObjectURL(file));
  };
  const handleCustomerVehiclePhotoChange = (file: File) => {
    setFormData(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        cvehiclePhoto: file
      }
    }));
    setCustomerVehiclePhotoPreview(URL.createObjectURL(file));
  };
  const handleCustomerPropertyPhotoChange = (file: File) => {
    setFormData(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        cpropertyPhoto: file
      }
    }));
    setCustomerPropertyPhotoPreview(URL.createObjectURL(file));
  };

  const handleGuardianPhotoChange = (file: File) => {
    setFormData(prev => ({
      ...prev,
      guardian: {
        ...prev.guardian,
        gphoto: file
      }
    }));
    setGuardianPhotoPreview(URL.createObjectURL(file));
  };
  const handleGuardianPropertyPhotoChange = (file: File) => {
    setFormData(prev => ({
      ...prev,
      guardian: {
        ...prev.guardian,
        gpropertyPhoto: file
      }
    }));
    setGuardianPropertyPhotoPreview(URL.createObjectURL(file));
  };

  // small helper for image url
  const imgUrl = (path?: string | null) => {
    if (!path) return null;
    // path may already be full URL or stored as /uploads/xxx
    if (path.startsWith('http')) return path;
    return `${API_ORIGIN}${path}`;
  };

  // navigate to existing customer profile (view/edit)
  const goToCustomer = (hplno?: string) => {
    if (!hplno) return;
    navigate(`/customers/${encodeURIComponent(hplno)}`);
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Form: spans 2 columns on md+ */}
        <div className="md:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-lg space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Add Customer</h2>
              {/* Inline notification about duplicate */}
              {isChecking ? (
                <div className="text-sm text-gray-500">Checking for duplicates...</div>
              ) : duplicateCustomer ? (
                <div className="px-3 py-1 bg-yellow-50 text-yellow-800 rounded-md text-sm">
                  This customer already exists in records.
                </div>
              ) : searchError ? (
                <div className="px-3 py-1 bg-red-50 text-red-800 rounded-md text-sm">{searchError}</div>
              ) : null}
            </div>

            {/* Customer Details */}
            <section className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-700">Customer Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Broker Name</label>
                  <input type="text" value={formData.customer.brokerName} onChange={(e)=> setFormData(prev=> ({ ...prev, customer: { ...prev.customer, brokerName: e.target.value } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">HPL No <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.customer.hplno} onChange={(e)=> setFormData(prev=> ({ ...prev, customer: { ...prev.customer, hplno: e.target.value } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Loan Status</label>
                  <select value={formData.customer.loanStatus} onChange={(e)=> setFormData(prev=> ({ ...prev, customer: { ...prev.customer, loanStatus: e.target.value as 'active' | 'close' } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                    <option value="active">Active</option>
                    <option value="close">Close</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Full Name <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.customer.cname} onChange={(e)=> setFormData(prev=> ({ ...prev, customer: { ...prev.customer, cname: e.target.value } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>

                <PhotoUpload label="Customer Photo" onChange={(file:File) => handleCustomerPhotoChange(file)} preview={customerPhotoPreview} />
                <PhotoUpload label="Customer Vehicle Photo" onChange={(file:File) => handleCustomerVehiclePhotoChange(file)} preview={customerVehiclePhotoPreview} />

                <PhotoUpload label="Customer Property Photo" onChange={(file:File) => handleCustomerPropertyPhotoChange(file)} preview={customerPropertyPhotoPreview} />

                <div className="flex space-x-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">Unit</label>
                    <select value={formData.customer.cfname.unit} onChange={(e)=> setFormData(prev=> ({ ...prev, customer: { ...prev.customer, cfname: { ...prev.customer.cfname, unit: e.target.value as 's/o'|'w/o'|'h/o' } } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                      <option value="s/o">S/O</option>
                      <option value="w/o">W/O</option>
                      <option value="h/o">H/O</option>
                    </select>
                  </div>

                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">Customer Fname <span className="text-red-500">*</span></label>
                    <input type="text" required value={formData.customer.cfname.value} onChange={(e)=> setFormData(prev=> ({ ...prev, customer: { ...prev.customer, cfname: { ...prev.customer.cfname, value: e.target.value } } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                  </div>
                </div>

                <div className="col-span-2">
                  <ContactFields contacts={formData.customer.ccontacts} onChange={(ccontacts)=> setFormData(prev=> ({ ...prev, customer: { ...prev.customer, ccontacts } }))} />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Address <span className="text-red-500">*</span></label>
                  <textarea required value={formData.customer.caddress} onChange={(e)=> setFormData(prev=> ({ ...prev, customer: { ...prev.customer, caddress: e.target.value } }))} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>
              </div>
            </section>

            {/* Guardian */}
            <section className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-700">Guardian Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Guardian Name</label>
                  <input type="text" value={formData.guardian.gname} onChange={(e)=> setFormData(prev=> ({ ...prev, guardian: { ...prev.guardian, gname: e.target.value } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>

                <PhotoUpload label="Guardian Photo" onChange={(file:File)=> handleGuardianPhotoChange(file)} preview={guardianPhotoPreview} />
                <PhotoUpload label="Guardian Property Photo" onChange={(file:File)=> handleGuardianPropertyPhotoChange(file)} preview={guardianPropertyPhotoPreview} />

                <div className="flex space-x-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">Unit</label>
                    <select value={formData.guardian.gfname.unit} onChange={(e)=> setFormData(prev=> ({ ...prev, guardian: { ...prev.guardian, gfname: { ...prev.guardian.gfname, unit: e.target.value as 's/o'|'w/o'|'h/o'|'c/o' } } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                      <option value="s/o">S/O</option>
                      <option value="w/o">W/O</option>
                      <option value="h/o">H/O</option>
                      <option value="c/o">C/O</option>
                    </select>
                  </div>

                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">Guardian Fname</label>
                    <input type="text" value={formData.guardian.gfname.value} onChange={(e)=> setFormData(prev=> ({ ...prev, guardian: { ...prev.guardian, gfname: { ...prev.guardian.gfname, value: e.target.value } } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                  </div>
                </div>

                <div className="col-span-2">
                  <ContactFields contacts={formData.guardian.gcontacts} onChange={(gcontacts)=> setFormData(prev=> ({ ...prev, guardian: { ...prev.guardian, gcontacts } }))} />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Guardian Address</label>
                  <textarea value={formData.guardian.gaddress} onChange={(e)=> setFormData(prev=> ({ ...prev, guardian: { ...prev.guardian, gaddress: e.target.value } }))} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>
              </div>
            </section>

            {/* Loan */}
            <section className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-700">Loan Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">HP Amount <span className="text-red-500">*</span></label>
                  <input type="number" required min={0} value={formData.loan.hpAmount || ''} onChange={(e) => setFormData(prev => ({ ...prev, loan: { ...prev.loan, hpAmount: e.target.value === '' ? 0 : Number(e.target.value) } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">HP Date <span className="text-red-500">*</span></label>
                  <DatePicker
                    required
                    value={formData.loan.hpDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, loan: { ...prev.loan, hpDate: e.target.value } }))}
                    className="mt-1"
                  />
                </div>

                <div className="flex space-x-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">Duration (months) <span className="text-red-500">*</span></label>
                    <input type="number" required min={1} value={formData.loan.dueMonth || ''} onChange={(e)=> setFormData(prev=> ({ ...prev, loan: { ...prev.loan, dueMonth: e.target.value === '' ? 0 : Number(e.target.value) } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Interest Rate (%) <span className="text-red-500">*</span></label>
                  <input type="number" required min={0} step="0.01" value={formData.loan.interestRate || ''} onChange={(e)=> setFormData(prev=> ({ ...prev, loan: { ...prev.loan, interestRate: e.target.value === '' ? 0 : Number(e.target.value) } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Due Amount</label>
                  <input type="number" readOnly value={formData.loan.dueAmount.toFixed(2)} className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Penalty Amount</label>
                  <input type="number" min={0} value={formData.loan.penaltyAmount || ''} onChange={(e)=> setFormData(prev=> ({ ...prev, loan: { ...prev.loan, penaltyAmount: e.target.value === '' ? 0 : Number(e.target.value) } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>
              </div>
            </section>

            {/* Vehicle */}
            <section className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-700">Vehicle Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Vehicle Number</label>
                  <input type="text" placeholder='TN 39 AA 0000' value={formData.vehicle.vehicleNumber} onChange={(e)=> setFormData(prev=> ({ ...prev, vehicle: { ...prev.vehicle, vehicleNumber: e.target.value } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Vehicle Model</label>
                  <input type="text" placeholder='Model' value={formData.vehicle.modelName} onChange={(e)=> setFormData(prev=> ({ ...prev, vehicle: { ...prev.vehicle, modelName: e.target.value } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Vehicle Name <span className="text-red-500">*</span></label>
                  <input type="text" required placeholder='Vehicle Name' value={formData.vehicle.vehicleName} onChange={(e)=> setFormData(prev=> ({ ...prev, vehicle: { ...prev.vehicle, vehicleName: e.target.value } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Vehicle Type <span className="text-red-500">*</span></label>
                  <select required value={formData.vehicle.type} onChange={(e)=> setFormData(prev=> ({ ...prev, vehicle: { ...prev.vehicle, type: e.target.value as 'bike'|'car'|'document' } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                    <option value="bike">Bike</option>
                    <option value="car">Car</option>
                    <option value="document">Document</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Vehicle Color</label>
                  <input type="text" placeholder='Color' value={formData.vehicle.color} onChange={(e)=> setFormData(prev=> ({ ...prev, vehicle: { ...prev.vehicle, color: e.target.value } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>
              </div>
            </section>

            <div className="flex justify-end pt-6">
              <button
                type="submit"
                disabled={!!duplicateCustomer}
                className={`flex items-center px-6 py-3 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${duplicateCustomer ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500'}`}
              >
                <Save className="w-5 h-5 mr-2" />
                Submit
              </button>
            </div>
          </form>
        </div>

        {/* Right panel: duplicate info card */}
        <aside className={`bg-white p-4 rounded-lg shadow-lg transition-transform duration-300 ${duplicateCustomer ? 'translate-x-0' : 'opacity-0 pointer-events-none scale-95'}`}>
          {duplicateCustomer ? (
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                  {duplicateCustomer.cphoto ? (
                    <img src={imgUrl(duplicateCustomer.cphoto)!} alt="customer" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">No Photo</div>
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-gray-800">{duplicateCustomer.cname}</h4>
                  <div className="text-sm text-gray-600">{duplicateCustomer.cfname?.value ? `${duplicateCustomer.cfname.unit} ${duplicateCustomer.cfname.value}` : ''}</div>
                  <div className="text-sm text-gray-500">{duplicateCustomer.vehicle?.vehicleNumber || ''}</div>
                </div>
              </div>

              {/* Vehicle photo + details */}
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-28 h-16 bg-gray-100 rounded overflow-hidden">
                    {duplicateCustomer.cvehiclePhoto ? (
                      <img src={imgUrl(duplicateCustomer.cvehiclePhoto)!} alt="vehicle" className="w-full h-full object-cover" />
                    ) : duplicateCustomer.vehicle?.vehicleNumber ? (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">{duplicateCustomer.vehicle.vehicleNumber}</div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">No Vehicle</div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm text-gray-700 font-medium">{duplicateCustomer.vehicle?.vehicleName || duplicateCustomer.vehicle?.modelName}</div>
                    <div className="text-xs text-gray-500">{duplicateCustomer.vehicle?.type || ''} • {duplicateCustomer.vehicle?.color || ''}</div>
                  </div>
                </div>

                {/* Loan summary */}
                <div className="p-3 rounded-md border border-gray-100 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">Loan Status</div>
                      <div className={`text-sm font-semibold ${duplicateCustomer.loan?.hpAmount ? 'text-indigo-700' : 'text-gray-700'}`}>{duplicateCustomer.loan ? (duplicateCustomer.customer?.loanStatus || duplicateCustomer.loan ? 'Active' : 'Close') : 'No Loan'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">Due</div>
                      <div className="text-lg font-bold text-red-600">₹ {duplicateCustomer.loan?.dueAmount ? Number(duplicateCustomer.loan.dueAmount).toFixed(2) : '0.00'}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-sm text-gray-600 grid grid-cols-2 gap-2">
                    <div>HP Amount: <span className="font-medium text-gray-800">₹ {duplicateCustomer.loan?.hpAmount || 0}</span></div>
                    <div>Penalty: <span className="font-medium text-gray-800">₹ {duplicateCustomer.loan?.penaltyAmount || 0}</span></div>
                    <div>Interest: <span className="font-medium text-gray-800">{duplicateCustomer.loan?.interestRate || 0}%</span></div>
                    <div>Months: <span className="font-medium text-gray-800">{duplicateCustomer.loan?.dueMonth || '-'}</span></div>
                  </div>
                </div>

                {/* Contacts / address */}
                <div>
                  <div className="text-sm text-gray-600">Contacts</div>
                  <div className="text-sm text-gray-800 space-y-1 mt-1">
                    {duplicateCustomer.contacts && duplicateCustomer.contacts.length ? (
                      duplicateCustomer.contacts.map((c: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between">
                          <div>{c.type || c}</div>
                          <div className="text-sm text-gray-600">{typeof c === 'string' ? c : c.number}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500">No contacts</div>
                    )}
                  </div>
                  <div className="mt-2 text-sm text-gray-600">Address</div>
                  <div className="text-sm text-gray-700">{duplicateCustomer.caddress || 'No address'}</div>
                </div>

                {/* Buttons */}
                <div className="flex space-x-2 pt-2">
                  <button onClick={()=> goToCustomer(duplicateCustomer.hplno)} className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">View Full Profile</button>
                  <button onClick={()=> {
                    // navigate to edit form or existing page that allows editing
                    navigate(`/customers/${encodeURIComponent(duplicateCustomer.hplno)}`);
                  }} className="flex-1 px-3 py-2 border border-gray-200 rounded-md">Update Instead?</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              No duplicate found. Fill form to add a new customer.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default AddCustomerForm;
