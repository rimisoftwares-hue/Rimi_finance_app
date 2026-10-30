import React, { createContext, useContext, useState } from "react";

interface UnpaidContextType {
  totalUnpaid: number;
  setTotalUnpaid: React.Dispatch<React.SetStateAction<number>>;
}

const UnpaidContext = createContext<UnpaidContextType | undefined>(undefined);

export const UnpaidProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [totalUnpaid, setTotalUnpaid] = useState(0);
  
  return (
    <UnpaidContext.Provider value={{ totalUnpaid, setTotalUnpaid }}>
      {children}
    </UnpaidContext.Provider>
  );
};

export const useUnpaid = () => {
  const context = useContext(UnpaidContext);
  if (!context) {
    throw new Error("useUnpaid must be used inside UnpaidProvider");
  }
  return context;
};
