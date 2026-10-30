const { db, isConnected } = require('./db');

exports.databaseScheme = (async () => {
  try {
    // // Create database if not exists (match SQL file)
    // await db.query(`CREATE DATABASE IF NOT EXISTS RimiFinanceDesktopDB 
    //                 CHARACTER SET utf8mb4 
    //                 COLLATE utf8mb4_unicode_ci`);

    // await db.query(`USE RimiFinanceDesktopDB`);

    // // Disable foreign key checks temporarily
    // await db.query(`SET FOREIGN_KEY_CHECKS = 0`);

    // ADDRESSES TABLE
    await db.query(`
      CREATE TABLE IF NOT EXISTS addresses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        house_no VARCHAR(50),
        street VARCHAR(100),
        street_name VARCHAR(100),
        village VARCHAR(100),
        land_mark VARCHAR(100),
        address VARCHAR(225),
        city VARCHAR(100),
        district VARCHAR(100),
        state VARCHAR(100),
        pincode VARCHAR(10),
        location VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        INDEX idx_state_city (state, city),
        INDEX idx_district_city (district, city),
        INDEX idx_pincode_city (pincode, city),
        INDEX idx_created_at (created_at),
        
        FULLTEXT INDEX ft_address (address),
        FULLTEXT INDEX ft_city_district (city, district, village)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // OWNER TABLE
    await db.query(`
      CREATE TABLE IF NOT EXISTS owner (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        password VARCHAR(255) NOT NULL,
        reset_token VARCHAR(255),
        reset_token_expiry DATETIME,
        is_active TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        UNIQUE INDEX uk_username (username),
        INDEX idx_username_active (username, is_active),
        INDEX idx_reset_token (reset_token),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // FINANCE DETAIL TABLE (Non-partitioned for simplicity in Node.js)
    await db.query(`
      CREATE TABLE IF NOT EXISTS finance_detail (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        finance_name VARCHAR(255) NOT NULL,
        phone_numbers JSON NOT NULL,
        emails JSON,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        UNIQUE KEY uk_owner_finance (owner_id, finance_name),
        KEY idx_owner_id (owner_id),
        KEY idx_is_active (is_active),
        KEY idx_created_at (created_at),
        FULLTEXT KEY ft_finance_name (finance_name),

        CONSTRAINT fk_finance_owner
          FOREIGN KEY (owner_id)
          REFERENCES owner (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS godowns (
          id INT AUTO_INCREMENT PRIMARY KEY,
          owner_id INT NOT NULL,
          finance_id INT NULL,
          name VARCHAR(150) NOT NULL,
          address VARCHAR(255),
          city VARCHAR(100),
          contact_person VARCHAR(150),
          contact_number VARCHAR(20),
          is_active BOOLEAN DEFAULT 1,

          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

          INDEX idx_owner (owner_id),
          INDEX idx_finance (finance_id),

          CONSTRAINT fk_godown_owner
              FOREIGN KEY (owner_id)
              REFERENCES owner(id)
              ON DELETE CASCADE,

          CONSTRAINT fk_godown_finance
              FOREIGN KEY (finance_id)
              REFERENCES finance_detail(id)
              ON DELETE SET NULL
      ) ENGINE=InnoDB 
      DEFAULT CHARSET=utf8mb4 
      COLLATE=utf8mb4_unicode_ci;
    `);

    // USERS_DETAILS TABLE
    await db.query(`
      CREATE TABLE IF NOT EXISTS users_details (
        id varchar(36) NOT NULL,
        finance_id int(11) NOT NULL,
        staff_name varchar(255) NOT NULL,
        staff_code varchar(50) DEFAULT NULL,
        father_spouse_name varchar(255) DEFAULT NULL,
        experience_years int(11) DEFAULT 0,
        education_qualification varchar(255) DEFAULT NULL,
        photo varchar(255) DEFAULT NULL,
        joining_date date DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        
        PRIMARY KEY (id),
        UNIQUE KEY uq_staff_code_finance (staff_code, finance_id),
        
        KEY idx_finance_id (finance_id),
        KEY idx_staff_name (staff_name),
        KEY idx_joining_date (joining_date),
        KEY idx_finance_staff_name (finance_id, staff_name),
        KEY idx_finance_joining_date (finance_id, joining_date),
        KEY idx_staff_code_finance_comp (staff_code, finance_id, staff_name),
        KEY idx_finance_created (finance_id, created_at),
        
        CONSTRAINT fk_users_details_finance 
          FOREIGN KEY (finance_id) 
          REFERENCES finance_detail (id) 
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    // USERS TABLE (Non-partitioned for simplicity)
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        email VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL,
        phone_no VARCHAR(15) NOT NULL,
        password VARCHAR(255) NOT NULL,
        user_role ENUM('owner','admin','agent','staff') NOT NULL,
        allowed_companies JSON DEFAULT (JSON_ARRAY()),
        login_time_from TIME,
        login_time_to TIME,
        last_login DATETIME,
        is_active TINYINT DEFAULT 1,
        reset_token VARCHAR(255),
        reset_token_expiry DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (id),
        UNIQUE KEY uk_user_id (user_id),
        UNIQUE KEY uk_email (email),
        UNIQUE KEY uk_username (username),
        UNIQUE KEY uk_phone_no (phone_no),

        KEY idx_user_role (user_role),
        KEY idx_is_active (is_active),
        KEY idx_last_login (last_login),
        KEY idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // VEHICLE INFO TABLE
    await db.query(`
      CREATE TABLE IF NOT EXISTS vehicle_info (
        id INT NOT NULL AUTO_INCREMENT,
        brand VARCHAR(100) NOT NULL,
        model_name VARCHAR(255) NOT NULL,
        make_year YEAR NOT NULL,
        fuel_type ENUM('petrol','diesel','electric','cng','hybrid') NOT NULL,
        engine_capacity VARCHAR(50) NOT NULL,
        fuel_tank_capacity VARCHAR(50),
        max_torque VARCHAR(50),
        top_speed VARCHAR(50),
        mileage VARCHAR(50),
        transmission ENUM('manual','automatic','cvt','amt'),
        seating_capacity INT,
        body_type ENUM(
          'sedan','hatchback','suv','muv',
          'coupe','convertible','scooter','bike'
        ),
        base_price DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (id),
        KEY idx_brand (brand),
        KEY idx_model_name (model_name),
        KEY idx_brand_model (brand, model_name),
        KEY idx_body_type (body_type),
        KEY idx_fuel_type (fuel_type),
        KEY idx_make_year (make_year),
        KEY idx_base_price (base_price)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    // VEHICLE DETAIL TABLE
    await db.query(`
      CREATE TABLE IF NOT EXISTS vehicle_detail (
        id INT AUTO_INCREMENT PRIMARY KEY,
        finance_id INT,
        vehicle_info_id INT,
        vehicle_number VARCHAR(100) NOT NULL,
        vehicle_modal VARCHAR(10),
        chassis_number VARCHAR(255),
        engine_number VARCHAR(255),
        num_owner INT DEFAULT 1,
        trip_driven INT DEFAULT 0,
        color VARCHAR(100),
        variant VARCHAR(100),
        selling_price DECIMAL(12,2),
        emi_from DECIMAL(10,2),
        base_price DECIMAL(12,2) NOT NULL,
        final_price DECIMAL(12,2) NOT NULL,
        status ENUM('available','hosted','sales','seized','sold') DEFAULT 'available',
        created_date DATE,
        selling_date DATE,
        hosting_info JSON,
        monthly_income_data JSON,
        deal_type ENUM('finance','consulting') NOT NULL,
        rc_holder ENUM('Company','customer','third_party','pending') DEFAULT 'Company',
        rc_status ENUM('original','duplicate','not_available') DEFAULT 'original',
        fc_expiry_date DATE,
        insurance_expiry_date DATE,
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        UNIQUE KEY uk_vehicle_number (vehicle_number),
        UNIQUE KEY uk_chassis (chassis_number),
        UNIQUE KEY uk_engine (engine_number),
        KEY idx_finance_id (finance_id),
        KEY idx_status (status),
        KEY idx_created_date (created_date),
        KEY idx_selling_date (selling_date),
        
        CONSTRAINT fk_vehicle_finance
          FOREIGN KEY (finance_id) REFERENCES finance_detail (id),
        CONSTRAINT fk_vehicle_info
          FOREIGN KEY (vehicle_info_id) REFERENCES vehicle_info (id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // CUSTOMERS TABLE (Non-partitioned)
    await db.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        finance_id INT,
        hplno INT NOT NULL,
        loanStatus ENUM('active','close','seized') NOT NULL,
        brokerName VARCHAR(100),
        cname VARCHAR(100) NOT NULL,
        cfname_value VARCHAR(100),
        cfname_unit VARCHAR(10),
        cphoto VARCHAR(255),
        cvehiclePhoto VARCHAR(255),
        cpropertyPhoto VARCHAR(255),
        vehicle_id INT,
        aadhar_id VARCHAR(12),
        other_govt_id_type ENUM('pan_card','voter_id','driving_license','other'),
        other_govt_id_number VARCHAR(50),
        profession VARCHAR(100),
        work_office_address TEXT,
        work_office_phone VARCHAR(15),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE KEY uk_aadhar_id (aadhar_id),
        KEY idx_finance_hplno (finance_id, hplno),
        KEY idx_loan_status (loanStatus),
        KEY idx_vehicle_id (vehicle_id),

        CONSTRAINT fk_customers_finance
          FOREIGN KEY (finance_id) REFERENCES finance_detail (id)
          ON DELETE SET NULL,
        CONSTRAINT fk_customers_vehicle
          FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail (id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // GUARDIANS TABLE
    await db.query(`
      CREATE TABLE IF NOT EXISTS guardians (
        id INT AUTO_INCREMENT PRIMARY KEY,
        finance_id INT,
        customer_id INT NOT NULL,
        gname VARCHAR(100) NOT NULL,
        gfname_value VARCHAR(100),
        gfname_unit VARCHAR(10),
        gphoto VARCHAR(255),
        gpropertyPhoto VARCHAR(255),
        aadhar_id VARCHAR(12),
        other_govt_id_type ENUM('pan_card','voter_id','driving_license','other'),
        other_govt_id_number VARCHAR(50),
        profession VARCHAR(100),
        remarks VARCHAR(100),
        work_office_address TEXT,
        work_office_phone VARCHAR(15),
        
        UNIQUE INDEX uk_aadhar_id (aadhar_id),
        INDEX idx_customer_id (customer_id),
        INDEX idx_finance_id (finance_id),
        INDEX idx_profession (profession),
        INDEX idx_finance_customer (finance_id, customer_id),
        
        FULLTEXT INDEX ft_gname (gname),
        
        CONSTRAINT fk_guardians_customer 
          FOREIGN KEY (customer_id) 
          REFERENCES customers (id)
          ON DELETE CASCADE,
        CONSTRAINT fk_guardians_finance 
          FOREIGN KEY (finance_id) 
          REFERENCES finance_detail (id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // LOANS TABLE (Non-partitioned)
    await db.query(`
      CREATE TABLE IF NOT EXISTS loans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        finance_id INT,
        customer_id INT NOT NULL,
        loan_type VARCHAR(50) NOT NULL,
        hpAmount DECIMAL(15,2),
        hpDate DATE,
        due_date DATE,
        dueMonth INT,
        interestRate DECIMAL(5,2),
        penaltyAmount DECIMAL(15,2),
        principle_part DECIMAL(15,2),
        interest_part DECIMAL(15,2),
        dueAmount DECIMAL(15,2),
        down_payment DECIMAL(15,2),
        pay_mode ENUM('cash','online','bank','upi','cheque','other'),
        net_payment DECIMAL(15,2),
        net_payable DECIMAL(15,2),
        pay_mode_1 ENUM('cash','online','bank','upi','cheque','other'),
        pay_mode_1_amount DECIMAL(15,2),
        hand_loan DECIMAL(15,2),
        hand_loan_remarks TEXT,
        broker_name VARCHAR(100),
        dealer_name VARCHAR(100),
        documentation_charge DECIMAL(15,2),
        broker_commission DECIMAL(15,2),
        remarks TEXT,

        KEY idx_finance_customer (finance_id, customer_id),
        KEY idx_customer_id (customer_id),
        KEY idx_due_date (due_date),
        KEY idx_hp_date (hpDate),
        KEY idx_broker_name (broker_name),
        KEY idx_dealer_name (dealer_name),
        
        CONSTRAINT fk_loans_customer
          FOREIGN KEY (customer_id) REFERENCES customers (id)
          ON DELETE CASCADE,
        CONSTRAINT fk_loans_finance
          FOREIGN KEY (finance_id) REFERENCES finance_detail (id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // PAYMENTS TABLE (Non-partitioned)
    await db.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        finance_id INT NOT NULL,
        customer_id INT NOT NULL,
        dueDate DATE NOT NULL,
        amount DECIMAL(15,2) DEFAULT 0,
        penalty DECIMAL(15,2) DEFAULT 0,
        status ENUM('pending','partial','paid') DEFAULT 'pending',
        payment_status ENUM('active','cancelled') DEFAULT 'active',
        paymentDate DATE NULL,
        billNumber VARCHAR(50),
        payment_mode ENUM('cash','online','bank','upi','cheque','other'),
        payment_mode_1 ENUM('cash','online','bank','upi','cheque','other'),
        payment_mode_1_amount DECIMAL(15,2),
        collected_by VARCHAR(100),
        cancelled_by VARCHAR(100),
        hand_loan DECIMAL(15,2),
        hand_loan_remark TEXT,
        remarks TEXT,
        edited_by VARCHAR(100),
        edited_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        KEY idx_customer_id (customer_id),
        KEY idx_finance_id (finance_id),
        KEY idx_payment_date (paymentDate),
        KEY idx_due_date (dueDate),
        KEY idx_bill_number (billNumber),
        KEY idx_payment_mode (payment_mode),
        KEY idx_finance_customer_date (finance_id, customer_id, paymentDate)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS sub_due (
        id INT AUTO_INCREMENT PRIMARY KEY,
        finance_id INT NOT NULL,
        customer_id INT NOT NULL,
        payment_id INT NOT NULL,
        bill_number VARCHAR(50) NOT NULL,
        payment_date DATE NOT NULL,
        paid_amount DECIMAL(15,2) NOT NULL,
        payment_mode ENUM('cash','online','bank','upi','cheque','other'),
        payment_mode_amount DECIMAL(15,2),
        payment_mode_1 ENUM('cash','online','bank','upi','cheque','other'),
        payment_mode_1_amount DECIMAL(15,2),
        status ENUM('active','cancelled') DEFAULT 'active',
        collected_by VARCHAR(100),
        cancelled_by VARCHAR(100),
        edited_by VARCHAR(100),
        edited_at TIMESTAMP,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        KEY idx_payment_id (payment_id),
        KEY idx_customer_id (customer_id),
        KEY idx_finance_id (finance_id),


        CONSTRAINT fk_subdue_customer 
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,

        CONSTRAINT fk_subdue_finance 
            FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
      );
    `);

    // CONTACTS TABLE
    await db.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_hplno INT NOT NULL,
        contact_type ENUM('customer','guardian') NOT NULL,
        type ENUM('mobile','landline','work') NOT NULL,
        number VARCHAR(20) NOT NULL,
        finance_id INT,
        
        INDEX idx_customer_hplno (customer_hplno),
        INDEX idx_contact_type (contact_type),
        INDEX idx_number (number),
        INDEX idx_finance_id (finance_id),
        INDEX idx_customer_type (customer_hplno, contact_type),
        UNIQUE INDEX uk_customer_number_type (customer_hplno, number, contact_type),
        
        CONSTRAINT fk_contacts_customer 
          FOREIGN KEY (customer_hplno) 
          REFERENCES customers (hplno)
          ON DELETE CASCADE,
        CONSTRAINT fk_contacts_finance 
          FOREIGN KEY (finance_id) 
          REFERENCES finance_detail (id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ADDRESS HISTORY TABLE
    await db.query(`
      CREATE TABLE IF NOT EXISTS address_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity_type ENUM('customer','guardian','user','finance') NOT NULL,
        entity_id VARCHAR(50) NOT NULL,
        address_id INT NOT NULL,
        is_current TINYINT DEFAULT 1,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        INDEX idx_entity_type_id (entity_type, entity_id),
        INDEX idx_address_id (address_id),
        INDEX idx_is_current (is_current),
        INDEX idx_changed_at (changed_at),
        INDEX idx_entity_address (entity_type, entity_id, address_id),
        
        CONSTRAINT fk_address_history_address 
          FOREIGN KEY (address_id) 
          REFERENCES addresses (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // HISTORY ENTRIES TABLE
    await db.query(`
      CREATE TABLE IF NOT EXISTS history_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        finance_id INT,
        customer_id INT NOT NULL,
        entry_type ENUM('call','rc_book') NOT NULL,
        message TEXT NOT NULL,
        entry_date DATE NOT NULL,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_customer_id (customer_id),
        INDEX idx_finance_id (finance_id),
        INDEX idx_entry_type (entry_type),
        INDEX idx_entry_date (entry_date),
        INDEX idx_created_at (created_at),
        INDEX idx_customer_date (customer_id, entry_date),
        INDEX idx_finance_customer (finance_id, customer_id),
        
        FULLTEXT INDEX ft_message (message),
        
        CONSTRAINT fk_history_customer 
          FOREIGN KEY (customer_id) 
          REFERENCES customers (id)
          ON DELETE CASCADE,
        CONSTRAINT fk_history_finance 
          FOREIGN KEY (finance_id) 
          REFERENCES finance_detail (id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // VEHICLE EXPENSES TABLE
    await db.query(`
      CREATE TABLE IF NOT EXISTS vehicle_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        finance_id INT,
        vehicle_id INT NOT NULL,
        expense_date DATE NOT NULL,
        description VARCHAR(500) NOT NULL,
        amount DECIMAL(15,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_vehicle_id (vehicle_id),
        INDEX idx_finance_id (finance_id),
        INDEX idx_expense_date (expense_date),
        INDEX idx_amount (amount),
        INDEX idx_vehicle_date (vehicle_id, expense_date),
        
        FULLTEXT INDEX ft_description (description),
        
        CONSTRAINT fk_expenses_vehicle 
          FOREIGN KEY (vehicle_id) 
          REFERENCES vehicle_detail (id)
          ON DELETE CASCADE,
        CONSTRAINT fk_expenses_finance 
          FOREIGN KEY (finance_id) 
          REFERENCES finance_detail (id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // VEHICLE IMAGES TABLE
    await db.query(`
      CREATE TABLE IF NOT EXISTS vehicle_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        finance_id INT,
        vehicle_id INT NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        image_type ENUM('front','side','back','interior','additional') NOT NULL,
        is_primary TINYINT DEFAULT 0,
        file_size INT,
        upload_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        INDEX idx_vehicle_id (vehicle_id),
        INDEX idx_finance_id (finance_id),
        INDEX idx_image_type (image_type),
        INDEX idx_is_primary (is_primary),
        INDEX idx_upload_date (upload_date),
        INDEX idx_vehicle_type (vehicle_id, image_type),
        
        CONSTRAINT fk_images_vehicle 
          FOREIGN KEY (vehicle_id) 
          REFERENCES vehicle_detail (id)
          ON DELETE CASCADE,
        CONSTRAINT fk_images_finance 
          FOREIGN KEY (finance_id) 
          REFERENCES finance_detail (id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS seizing_vehicle (
        id INT AUTO_INCREMENT PRIMARY KEY,
        finance_id INT NOT NULL,
        customer_id INT NOT NULL,
        vehicle_id INT NOT NULL,

        bill_number VARCHAR(50),

        godown_id INT,
        seizing_charge DECIMAL(10,2) NOT NULL,

        description VARCHAR(255),
        seized_by VARCHAR(150) NOT NULL,
        seizing_date DATE NOT NULL,

        status ENUM('Pending', 'Paid', 'Cancelled') DEFAULT 'Pending',
        release_date DATE NULL,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE CASCADE,
        FOREIGN KEY (godown_id) REFERENCES godowns(id) ON DELETE SET NULL
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS office_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,

        finance_id INT NOT NULL,   -- Added

        transaction_type ENUM('Income','Expense') NOT NULL,

        expense_date DATE NOT NULL,
        category VARCHAR(255) NOT NULL,
        description VARCHAR(500),
        amount DECIMAL(15,2) NOT NULL,

        payment_mode ENUM('Cash','UPI','Bank') DEFAULT 'Cash',

        entered_by VARCHAR(150) NOT NULL,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        KEY idx_expense_date (expense_date),
        KEY idx_category (category),
        KEY idx_transaction_type (transaction_type),
        KEY idx_entered_by (entered_by),

        FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
    );
    `);

    // RECENT ACTIVITY TABLE
    await db.query(`
      CREATE TABLE IF NOT EXISTS recent_activity (
        id INT AUTO_INCREMENT PRIMARY KEY,
        finance_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        reference_id VARCHAR(100),
        description TEXT,
        amount DECIMAL(15,2),
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        INDEX idx_finance_id (finance_id),
        INDEX idx_type (type),
        INDEX idx_reference_id (reference_id),
        INDEX idx_amount (amount),
        INDEX idx_created_by (created_by),
        INDEX idx_created_at (created_at),
        INDEX idx_finance_date (finance_id, created_at),
        
        FULLTEXT INDEX ft_description (description),
        
        CONSTRAINT fk_activity_finance 
          FOREIGN KEY (finance_id) 
          REFERENCES finance_detail (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Re-enable foreign key checks
    await db.query(`SET FOREIGN_KEY_CHECKS = 1`);

    console.log('✅ All tables created successfully!');

  } catch (err) {
    console.error('❌ Error during table creation:', err);
    process.exit(1);
  }
})();