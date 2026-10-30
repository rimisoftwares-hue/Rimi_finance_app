import { useState } from 'react';
import { MapPin, Phone, User2, Home, Briefcase, CreditCard, Building2, FileText, BadgeCheck, Pencil, Plus} from 'lucide-react';
import { CustomerDetails, GuardianDetails, Addresses, LoanDetails } from '../../types/customer';
import PhotoModal from './PhotoModal';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import LocationDialog from './LocationDialog'; 

interface CustomerHeaderProps {
  customer: CustomerDetails;
  guardian: GuardianDetails;
  loan: LoanDetails;
  baseUrl?: string;
}

type PhotoUrl = {
  signed_url?: string;
  original_url?: string;
};


const formatAddress = (address?: Addresses | string | null): string => {
  if (!address) return '';
  if (typeof address === 'string') return address.trim();
  
  const parts = [
    address.house_no,
    address.street,
    address.street_name,
    address.village,
    address.land_mark && `Near ${address.land_mark}`,
    address.city,
    address.district,
    address.state,
    address.pincode,
  ].map(p => (typeof p === 'string' ? p.trim() : p)).filter(Boolean);
  
  return parts.join(', ') || (address.address ? address.address.trim() : '');
};

const getIdTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    pan_card: 'PAN Card',
    voter_id: 'Voter ID',
    driving_license: 'Driving License',
    other: 'Other ID',
  };
  return labels[type] || type;
};

const getLoanStatusColor = (status: string) => {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'close':
      return 'bg-slate-500/10 text-slate-600 border-slate-500/20';
    case 'seized':
      return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const CustomerHeader = ({ customer, guardian, loan, baseUrl = `${import.meta.env.VITE_API_URL} `}: CustomerHeaderProps) => {
  const [photoModal, setPhotoModal] = useState<{ open: boolean; src: string; alt: string }>({
    open: false,
    src: '',
    alt: '',
  });

  const [locationDialog, setLocationDialog] = useState<{
    open: boolean;
    entityType: 'customer' | 'guardian';
  }>({
    open: false,
    entityType: 'customer',
  });

  const openGoogleMaps = (address?: string | null) => {
    if (!address?.trim()) return;
    const encodedAddress = encodeURIComponent(address.trim());
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
  };

  const handleLocationUpdated = () => {
    // Refresh customer data
    window.location.reload();
  };

  const getImageUrl = (
    photo: PhotoUrl | File | null | undefined,
    fallback: string
  ) => {
    if (!photo) return fallback;

    // If user just uploaded a file
    if (photo instanceof File) {
      return URL.createObjectURL(photo);
    }

    // If backend returns object
    if (typeof photo === 'object') {
      const url = photo.signed_url || photo.original_url;
      if (!url) return fallback;

      // Full URL
      if (url.startsWith('http')) return url;

      // Relative URL
      return `${baseUrl}${url}`;
    }

    return fallback;
  };



  const openPhotoModal = (src: string, alt: string) => {
    setPhotoModal({ open: true, src, alt });
  };

  const hasGuardian = guardian && (guardian.gname || (guardian as any)?.name);
  const hplNumber = customer?.hplno ?? (customer as any)?.hpl_no ?? (customer as any)?.hplNo ?? (loan as any)?.hplno ?? '—';
  const currentStatus = customer?.loanStatus || (customer as any)?.loan_status || 'active';
  const dealerName = loan?.dealer_name || (loan as any)?.dealerName;
  const brokerName = loan?.broker_name || (loan as any)?.brokerName || customer?.brokerName || (customer as any)?.broker_name;
  const customerLocation = customer?.address?.location;
  const guardianLocation = guardian?.address?.location;

  return (
    <>
      <div className="card-elevated p-4 sm:p-6 lg:p-8 animate-slide-up">
        {/* Header with HPL Number and Status */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">HPL No:</span>
            <span className="font-display font-bold text-lg text-primary">{hplNumber}</span>
          </div>
          <div className="flex items-center gap-3">
            {dealerName && (
              <Badge variant="outline" className="text-xs">
                Dealer: {dealerName}
              </Badge>
            )}
            {brokerName && (
              <Badge variant="outline" className="text-xs">
                Broker: {brokerName}
              </Badge>
            )}
            <Badge className={`${getLoanStatusColor(currentStatus)} border capitalize font-semibold`}>
              {currentStatus}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6 lg:gap-8">
          {/* Customer Section */}
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
              {/* Customer Photo Section */}
              <div className="flex flex-row sm:flex-col items-center gap-4">
                <div
                  className="relative w-[50vw] max-w-[12rem] min-w-[12.5rem] max-h-[13rem] aspect-square mx-auto cursor-pointer group shrink-0"
                  onClick={() =>
                    openPhotoModal(
                      getImageUrl(customer.cphoto, 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop'),
                      'Customer Photo'
                    )
                  }
                >
                  {/* Main circular photo container */}
                  
                  <Avatar className="w-48 h-48 rounded-full overflow-hidden border-4 border-blue-500 p-1">
                    <AvatarImage
                      src={getImageUrl(customer.cphoto, 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop')}
                      alt="Customer"
                      className="object-cover w-full h-full"
                    />
                    <AvatarFallback className="text-2xl sm:text-3xl font-display bg-primary/10 text-primary w-full h-full flex items-center justify-center">
                      {customer.cname?.charAt(0) || 'C'}
                    </AvatarFallback>
                  </Avatar>
                  {/* Spinning border effect */}
                <div className="absolute inset-0 rounded-full border-4 border-blue-200 border-dashed animate-spin-slow"></div>
                  
                  
                  {/* Hover overlay */}
                  <div className="absolute inset-0 rounded-full bg-primary/0 group-hover:bg-primary/10 transition-colors flex items-center justify-center">
                    <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium">
                      View
                    </span>
                  </div>
                </div>

                {/* Secondary Photos */}
                <div className="flex sm:flex-row gap-5">
                  <div
                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 border-border cursor-pointer hover:border-primary transition-colors"
                    onClick={() =>
                      openPhotoModal(
                        getImageUrl(customer.cvehiclePhoto, './scooter-front-48.png'),
                        'Customer Vehicle'
                      )
                    }
                  >
                    <img
                      src={getImageUrl(customer.cvehiclePhoto, './scooter-front-48.png')}
                      alt="Vehicle"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div
                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 border-border cursor-pointer hover:border-primary transition-colors"
                    onClick={() =>
                      openPhotoModal(
                        getImageUrl(customer.cpropertyPhoto, './home-page-96.png'),
                        'Customer Property'
                      )
                    }
                  >
                    <img
                      src={getImageUrl(customer.cpropertyPhoto, './home-page-96.png')}
                      alt="Property"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="flex-1 min-w-0 space-y-4">
                <div>
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-display font-bold text-foreground truncate">
                    {customer.cname}
                  </h1>
                  {customer.cfname?.value && (
                    <p className="text-muted-foreground text-sm sm:text-base mt-1">
                      <span className="uppercase text-xs font-semibold">{customer.cfname.unit}</span>{' '}
                      {customer.cfname.value}
                    </p>
                  )}
                </div>

                {/* ID Information */}
                <div className="flex flex-wrap gap-2">
                  {customer.aadhar_id && (
                    <div className="inline-flex items-center gap-1.5 bg-secondary/50 px-2.5 py-1 rounded-md text-xs sm:text-sm">
                      <BadgeCheck className="w-3.5 h-3.5 text-primary" />
                      <span className="text-muted-foreground">Aadhar:</span>
                      <span className="font-medium text-foreground">{customer.aadhar_id}</span>
                    </div>
                  )}
                  {customer.other_govt_id_number && (
                    <div className="inline-flex items-center gap-1.5 bg-secondary/50 px-2.5 py-1 rounded-md text-xs sm:text-sm">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                      <span className="text-muted-foreground">{getIdTypeLabel(customer.other_govt_id_type)}:</span>
                      <span className="font-medium text-foreground">{customer.other_govt_id_number}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-4">
                  {/* Profession */}
                  {customer.profession && (
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-foreground">{customer.profession}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  {customerLocation ? (
                    <>
                      <button
                        onClick={() => openGoogleMaps(customerLocation)}
                        className="text-foreground hover:text-primary hover:underline transition-colors text-left"
                        title="Click to open in Google Maps"
                      >
                        {customerLocation}
                      </button>
                      <button
                        onClick={() => setLocationDialog({ open: true, entityType: 'customer' })}
                        className="p-1 hover:bg-secondary rounded-full transition-colors"
                        title="Edit location"
                      >
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground">No location set</span>
                      <button
                        onClick={() => setLocationDialog({ open: true, entityType: 'customer' })}
                        className="p-1 hover:bg-secondary rounded-full transition-colors"
                        title="Add location"
                      >
                        <Plus className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    </>
                  )}
                </div>
                </div>
              </div>
            </div>

            {/* Contact Grid - Responsive */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Address */}
              <div className="space-y-2 p-3 sm:p-4 bg-muted/30 rounded-lg">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Home className="w-3.5 h-3.5" />
                  Address
                </h3>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground leading-relaxed">
                    {customer.full_address || formatAddress(customer.address) || (customer as any)?.caddress || 'No address provided'}
                  </p>
                </div>
              </div>

              {/* Contact Numbers */}
              <div className="space-y-2 p-3 sm:p-4 bg-muted/30 rounded-lg">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5" />
                  Contact
                </h3>
                <div className="space-y-2">
                  {customer.ccontacts?.filter(c => c.contact_type === 'customer')?.map((contact, idx) => (
                    <div key={idx} className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs capitalize shrink-0">
                        {contact.type}
                      </Badge>
                      <a
                        href={`tel:${contact.number}`}
                        className="text-sm text-primary hover:underline font-medium"
                      >
                        {contact.number}
                      </a>
                    </div>
                  ))}
                  {customer.work_office_phone && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs shrink-0">
                        Work
                      </Badge>
                      <a
                        href={`tel:${customer.work_office_phone}`}
                        className="text-sm text-primary hover:underline font-medium"
                      >
                        {customer.work_office_phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Work Address */}
              {customer.work_office_address && (
                <div className="space-y-2 p-3 sm:p-4 bg-muted/30 rounded-lg sm:col-span-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5" />
                    Work/Office Address
                  </h3>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-sm text-foreground leading-relaxed">{customer.work_office_address}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Guardian Section */}
           {hasGuardian && (
          <div className="xl:border-l xl:border-border xl:pl-6 lg:pl-8 space-y-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2 pb-2 border-b border-border">
              <User2 className="w-4 h-4" />
              Guardian Information
            </h3>

            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
              {/* Guardian Photos */}
              <div className="flex flex-row sm:flex-col items-center gap-3">
                <div
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-3 border-border cursor-pointer hover:border-primary transition-colors shrink-0"
                  onClick={() =>
                    openPhotoModal(
                      getImageUrl(guardian.gphoto, 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop'),
                      'Guardian Photo'
                    )
                  }
                >
                  <img
                    src={getImageUrl(guardian.gphoto, 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop')}
                    alt="Guardian"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden border-2 border-border cursor-pointer hover:border-primary transition-colors"
                  onClick={() =>
                    openPhotoModal(
                      getImageUrl(guardian.gpropertyPhoto, './home-page-96.png'),
                      'Guardian Property'
                    )
                  }
                >
                  <img
                    src={getImageUrl(guardian.gpropertyPhoto, './home-page-96.png')}
                    alt="Property"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Guardian Info */}
              <div className="flex-1 min-w-0 space-y-4">
                <div>
                  <p className="font-display font-semibold text-lg text-foreground truncate">
                    {guardian.gname}
                  </p>
                  {guardian.gfname?.value && (
                    <p className="text-muted-foreground text-sm mt-0.5">
                      <span className="uppercase text-xs font-semibold">{guardian.gfname.unit}</span>{' '}
                      {guardian.gfname.value}
                    </p>
                  )}
                </div>

                {/* Guardian ID Information */}

                <div className="flex flex-wrap gap-2">
                  {guardian.aadhar_id && (
                    <div className="inline-flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md text-xs">
                      <BadgeCheck className="w-3 h-3 text-primary" />
                      <span className="text-muted-foreground">Aadhar:</span>
                      <span className="font-medium text-foreground">{guardian.aadhar_id}</span>
                    </div>
                  )}
                  {guardian.other_govt_id_number && (
                    <div className="inline-flex items-center gap-1.5 bg-secondary/50 px-2.5 py-1 rounded-md text-xs sm:text-sm">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                      <span className="text-muted-foreground">{getIdTypeLabel(guardian.other_govt_id_type)}:</span>
                      <span className="font-medium text-foreground">{guardian.other_govt_id_number}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-4">
                  {/* Guardian Profession */}
                  {guardian.profession && (
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-foreground">{guardian.profession}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-primary shrink-0" />
                    {guardianLocation ? (
                      <>
                        <button
                          onClick={() => openGoogleMaps(guardianLocation)}
                          className="text-foreground hover:text-primary hover:underline transition-colors text-left"
                          title="Click to open in Google Maps"
                        >
                          {guardianLocation}
                        </button>
                        <button
                          onClick={() => setLocationDialog({ open: true, entityType: 'guardian' })}
                          className="p-1 hover:bg-secondary rounded-full transition-colors"
                          title="Edit location"
                        >
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-muted-foreground">No location set</span>
                        <button
                          onClick={() => setLocationDialog({ open: true, entityType: 'guardian' })}
                          className="p-1 hover:bg-secondary rounded-full transition-colors"
                          title="Add location"
                        >
                          <Plus className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Guardian Contact Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Guardian Address */}
              <div className="space-y-2 p-3 sm:p-4 bg-muted/30 rounded-lg">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Home className="w-3.5 h-3.5" />
                  Address
                </h4>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground leading-relaxed">
                    {guardian.full_address || formatAddress(guardian.address) || (guardian as any)?.g_address || 'No address provided'}
                  </p>
                </div>
              </div>

              {/* Guardian Contacts */}
              <div className="space-y-2 p-3 sm:p-4 bg-muted/30 rounded-lg">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5" />
                  Contact
                </h4>
                <div className="space-y-2">
                  {guardian.gcontacts && guardian.gcontacts.length > 0 ? (
                    guardian.gcontacts.map((contact, idx) => (
                      <div key={idx} className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs capitalize shrink-0">
                          {contact.type}
                        </Badge>
                        <a
                          href={`tel:${contact.number}`}
                          className="text-sm text-primary hover:underline font-medium"
                        >
                          {contact.number}
                        </a>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No contacts available</p>
                  )}
                  {guardian.work_office_phone && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs shrink-0">
                        Work
                      </Badge>
                      <a
                        href={`tel:${guardian.work_office_phone}`}
                        className="text-sm text-primary hover:underline font-medium"
                      >
                        {guardian.work_office_phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Guardian Work Address */}
              {guardian.work_office_address && (
                <div className="space-y-2 p-3 sm:p-4 bg-muted/30 rounded-lg sm:col-span-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5" />
                    Work/Office Address
                  </h4>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground leading-relaxed">{guardian.work_office_address}</p>
                  </div>
                </div>
              )}

              {/* Guardian Remarks */}
              {guardian.remarks && (
                <div className="space-y-2 p-3 sm:p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg sm:col-span-2">
                  <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
                    Remarks
                  </h4>
                  <p className="text-sm text-foreground">{guardian.remarks}</p>
                </div>
              )}
            </div>
          </div>
           )}
        </div>
      </div>

      <PhotoModal
        isOpen={photoModal.open}
        onClose={() => setPhotoModal({ ...photoModal, open: false })}
        src={photoModal.src}
        alt={photoModal.alt}
      />

      {/* Location Dialog */}
      <LocationDialog
        isOpen={locationDialog.open}
        onClose={() => setLocationDialog({ open: false, entityType: 'customer' })}
        customerId={customer?.id?.toString() || ''}
        customerName={customer?.cname || ''}
        currentLocation={(locationDialog.entityType === 'customer' 
          ? customerLocation 
          : guardianLocation) || ''}
        onLocationUpdated={handleLocationUpdated}
        entityType={locationDialog.entityType}
      />

    </>
  );
};

export default CustomerHeader;
