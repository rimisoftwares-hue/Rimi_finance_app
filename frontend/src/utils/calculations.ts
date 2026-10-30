
export function calculateEMI(principal: number, rate: number, duration: number): number {
  const monthlyRate = (rate / 100);
  const totalMonths = duration;
  
  if (monthlyRate === 0) return Math.round(principal / totalMonths);
  const emi = (principal*monthlyRate)+(principal/duration)
  const DueAmount = Math.round(emi/ 10) * 10
  return DueAmount; // Round to nearest whole number
}


export const calculateLoanDetails = (
  hpAmount: number,
  interestRate: number,
  dueMonth: number
) => {
  
  if (!hpAmount || !interestRate || !dueMonth) return null;
  if (interestRate === 0){
    const DueAmount = Math.round(hpAmount / dueMonth)
    const principal = hpAmount * dueMonth
    return {
    dueAmount: DueAmount,
    principlePart :principal,
    interestPart : 0,
    net_payable : 0
  };}
  // Calculate due amount (rounded)
  const monthlyInterestRate = interestRate / 100;
  // if (monthlyInterestRate === 0) return Math.round(hpAmount / dueMonth);

  // const dueAmount = Math.round(hpAmount + (hpAmount * monthlyInterestRate * dueMonth));
  const dueAmount1 = (hpAmount*monthlyInterestRate)+(hpAmount/dueMonth)
  // Round to nearest 10
  const roundedDueAmount = Math.round(dueAmount1 / 10) * 10;
  
  // Calculate principle and interest parts
  const interestPart = hpAmount * monthlyInterestRate;
  const principlePart = hpAmount / dueMonth;
  const net_payable = roundedDueAmount * dueMonth
  return {
    dueAmount: roundedDueAmount,
    principlePart,
    interestPart,
    net_payable
  };
};


export function getValidDate2(dateString : string) {
  console.log("GETVALIDDATE2 :",dateString)
  
  // First try to parse the input date
  const dateParts = dateString.split('-');
  if (dateParts.length !== 3) {
      // Return current date if format is invalid
      return getCurrentDateFormatted();
  }

  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10);
  let day = parseInt(dateParts[2], 10);

  // Validate year, month, day ranges
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return getCurrentDateFormatted();
  }

  // Check if month is valid (1-12)
  if (month < 1 || month > 12) {
      return getCurrentDateFormatted();
  }

  // Get the last day of the month
  const lastDay = new Date(year, month, 0).getDate();

  // Adjust day if it's invalid
  if (day < 1) {
      day = 1;
  } else if (day > lastDay) {
      day = lastDay;
  }
  function getCurrentDateFormatted() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  // Format the date as YYYY-MM-DD with leading zeros
  const formattedMonth = month.toString().padStart(2, '0');
  const formattedDay = day.toString().padStart(2, '0');

  return `${year}-${formattedMonth}-${formattedDay}`;
}


export const getDaysBetweenDates = (date1: string, date2: Date): number  => {
  
  // Helper function to get a valid date (adjusts invalid dates to next month's valid date)
  function getNextMonthValidDate(inputDate: string): Date {
    const [year, month, day] = inputDate.split('-').map(Number);
    
    // Calculate next month and year
    let nextMonth = month + 1;
    let nextYear = year;
    
    if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
    }
    
    // Get the last day of next month
    const lastDayOfNextMonth = new Date(nextYear, nextMonth, 0).getDate();
    
    // Use the minimum of either the original day or the last day of next month
    const validDay = Math.min(day, lastDayOfNextMonth);
    
    return new Date(nextYear, nextMonth - 1, validDay);
  }

  // Get valid dates (adjusted if necessary)
  
  // Normalize both dates to midnight (ignore time differences)
  const d2 = getNextMonthValidDate(date1);
  const d1 = new Date(date2);

  // Normalize both dates to midnight (ignore time differences)
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);

  // Calculate difference in milliseconds
  const timeDiff = d1.getTime() - d2.getTime();
  
  // Convert milliseconds to days (86400000 ms = 1 day)
  const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  
  return daysDiff;
};


export const getDaysDifference = (date1: Date, date2: Date): number => {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
};


