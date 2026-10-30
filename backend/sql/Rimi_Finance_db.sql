CREATE TABLE `address_history` (
   `id` int NOT NULL AUTO_INCREMENT,
   `entity_type` enum('customer','guardian','user','finance') COLLATE utf8mb4_unicode_ci NOT NULL,
   `entity_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
   `address_id` int NOT NULL,
   `is_current` tinyint DEFAULT '1',
   `changed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`),
   KEY `idx_entity_type_id` (`entity_type`,`entity_id`),
   KEY `idx_address_id` (`address_id`),
   KEY `idx_is_current` (`is_current`),
   KEY `idx_changed_at` (`changed_at`),
   KEY `idx_entity_address` (`entity_type`,`entity_id`,`address_id`),
   CONSTRAINT `fk_address_history_address` FOREIGN KEY (`address_id`) REFERENCES `addresses` (`id`) ON DELETE CASCADE
 ) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC

 CREATE TABLE `addresses` (
   `id` int NOT NULL AUTO_INCREMENT,
   `house_no` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `street` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `street_name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `village` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `land_mark` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `address` varchar(225) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `city` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `district` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `state` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `pincode` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `location` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`),
   KEY `idx_state` (`state`),
   KEY `idx_district` (`district`),
   KEY `idx_city` (`city`),
   KEY `idx_pincode` (`pincode`),
   KEY `idx_village` (`village`),
   KEY `idx_state_city` (`state`,`city`),
   KEY `idx_created_at` (`created_at`),
   FULLTEXT KEY `idx_ft_address` (`address`),
   FULLTEXT KEY `idx_ft_city_district` (`city`,`district`)
 ) ENGINE=InnoDB AUTO_INCREMENT=47 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

 CREATE TABLE `contacts` (
   `id` int NOT NULL AUTO_INCREMENT,
   `customer_id` int NOT NULL,
   `contact_type` enum('customer','guardian') COLLATE utf8mb4_unicode_ci NOT NULL,
   `type` enum('mobile','landline','work') COLLATE utf8mb4_unicode_ci NOT NULL,
   `number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
   `finance_id` int DEFAULT NULL,
   PRIMARY KEY (`id`),
   UNIQUE KEY `uk_customer_number_type` (`customer_id`,`number`,`contact_type`),
   KEY `idx_customer_id` (`customer_id`),
   KEY `idx_contact_type` (`contact_type`),
   KEY `idx_number` (`number`),
   KEY `idx_finance_id` (`finance_id`),
   KEY `idx_customer_type` (`customer_id`,`contact_type`),
   CONSTRAINT `fk_contacts_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
   CONSTRAINT `fk_contacts_finance` FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`) ON DELETE SET NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC


 CREATE TABLE `customers` (
   `id` int NOT NULL AUTO_INCREMENT,
   `finance_id` int DEFAULT NULL,
   `hplno` int NOT NULL,
   `loanStatus` enum('active','close','seized') NOT NULL,
   `brokerName` varchar(100) DEFAULT NULL,
   `cname` varchar(100) NOT NULL,
   `cfname_value` varchar(100) DEFAULT NULL,
   `cfname_unit` varchar(10) DEFAULT NULL,
   `cphoto` varchar(255) DEFAULT NULL,
   `cvehiclePhoto` varchar(255) DEFAULT NULL,
   `cpropertyPhoto` varchar(255) DEFAULT NULL,
   `vehicle_id` int DEFAULT NULL,
   `aadhar_id` varchar(12) DEFAULT NULL,
   `other_govt_id_type` enum('pan_card','voter_id','driving_license','other') DEFAULT NULL,
   `other_govt_id_number` varchar(50) DEFAULT NULL,
   `profession` varchar(100) DEFAULT NULL,
   `work_office_address` text,
   `work_office_phone` varchar(15) DEFAULT NULL,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`),
   UNIQUE KEY `uk_aadhar_id` (`aadhar_id`),
   KEY `idx_finance_hplno` (`finance_id`,`hplno`),
   KEY `idx_loan_status` (`loanStatus`),
   KEY `idx_vehicle_id` (`vehicle_id`),
   CONSTRAINT `fk_customers_finance` FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`) ON DELETE SET NULL,
   CONSTRAINT `fk_customers_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicle_detail` (`id`) ON DELETE SET NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

 CREATE TABLE `finance_detail` (
   `id` int NOT NULL AUTO_INCREMENT,
   `owner_id` int NOT NULL,
   `finance_name` varchar(255) NOT NULL,
   `phone_numbers` json NOT NULL,
   `emails` json DEFAULT NULL,
   `is_active` tinyint DEFAULT '1',
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   `finance_photo` varchar(255) DEFAULT NULL,
   `since` varchar(20) DEFAULT NULL,
   PRIMARY KEY (`id`),
   UNIQUE KEY `uk_owner_finance` (`owner_id`,`finance_name`),
   KEY `idx_owner_id` (`owner_id`),
   KEY `idx_is_active` (`is_active`),
   KEY `idx_created_at` (`created_at`),
   FULLTEXT KEY `ft_finance_name` (`finance_name`),
   CONSTRAINT `fk_finance_owner` FOREIGN KEY (`owner_id`) REFERENCES `owner` (`id`)
 ) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci


CREATE TABLE IF NOT EXISTS godowns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL,
    finance_id INT NULL,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(255),
    city VARCHAR(100),
    contact_person VARCHAR(150),
    contact_number VARCHAR(20),
    status ENUM('Active','Inactive') DEFAULT 'Active',

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

 CREATE TABLE `guardians` (
   `id` int NOT NULL AUTO_INCREMENT,
   `finance_id` int DEFAULT NULL,
   `customer_id` int NOT NULL,
   `gname` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
   `gfname_value` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
   `gfname_unit` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
   `gphoto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
   `gpropertyPhoto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
   `aadhar_id` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
   `other_govt_id_type` enum('pan_card','voter_id','driving_license','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
   `other_govt_id_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
   `profession` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
   `remarks` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
   `work_office_address` text COLLATE utf8mb4_unicode_ci,
   `work_office_phone` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
   PRIMARY KEY (`id`),
   UNIQUE KEY `uk_aadhar_id` (`aadhar_id`),
   KEY `idx_customer_id` (`customer_id`),
   KEY `idx_finance_id` (`finance_id`),
   KEY `idx_profession` (`profession`),
   KEY `idx_finance_customer` (`finance_id`,`customer_id`),
   FULLTEXT KEY `ft_gname` (`gname`),
   CONSTRAINT `fk_guardians_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
   CONSTRAINT `fk_guardians_finance` FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`) ON DELETE SET NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC


 CREATE TABLE `history_entries` (
   `id` int NOT NULL AUTO_INCREMENT,
   `finance_id` int DEFAULT NULL,
   `customer_id` int NOT NULL,
   `entry_type` enum('call','rc_book') COLLATE utf8mb4_unicode_ci NOT NULL,
   `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
   `entry_date` date NOT NULL,
   `created_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`),
   KEY `idx_customer_id` (`customer_id`),
   KEY `idx_finance_id` (`finance_id`),
   KEY `idx_entry_type` (`entry_type`),
   KEY `idx_entry_date` (`entry_date`),
   KEY `idx_created_at` (`created_at`),
   KEY `idx_customer_date` (`customer_id`,`entry_date`),
   KEY `idx_finance_customer` (`finance_id`,`customer_id`),
   FULLTEXT KEY `ft_message` (`message`),
   CONSTRAINT `fk_history_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
   CONSTRAINT `fk_history_finance` FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`) ON DELETE SET NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC

 CREATE TABLE `loans` (
   `id` int NOT NULL AUTO_INCREMENT,
   `finance_id` int DEFAULT NULL,
   `customer_id` int NOT NULL,
   `loan_type` varchar(50) NOT NULL,
   `hpAmount` decimal(15,2) DEFAULT NULL,
   `hpDate` date DEFAULT NULL,
   `due_date` date DEFAULT NULL,
   `dueMonth` int DEFAULT NULL,
   `interestRate` decimal(5,2) DEFAULT NULL,
   `penaltyAmount` decimal(15,2) DEFAULT NULL,
   `principle_part` decimal(15,2) DEFAULT NULL,
   `interest_part` decimal(15,2) DEFAULT NULL,
   `dueAmount` decimal(15,2) DEFAULT NULL,
   `down_payment` decimal(15,2) DEFAULT NULL,
   `pay_mode` enum('cash','online','bank','upi','cheque','other') DEFAULT NULL,
   `net_payment` decimal(15,2) DEFAULT NULL,
   `net_payable` decimal(15,2) DEFAULT NULL,
   `pay_mode_1` enum('cash','online','bank','upi','cheque','other') DEFAULT NULL,
   `pay_mode_1_amount` decimal(15,2) DEFAULT NULL,
   `hand_loan` decimal(15,2) DEFAULT NULL,
   `hand_loan_remarks` text,
   `broker_name` varchar(100) DEFAULT NULL,
   `dealer_name` varchar(100) DEFAULT NULL,
   `documentation_charge` decimal(15,2) DEFAULT NULL,
   `broker_commission` decimal(15,2) DEFAULT NULL,
   `remarks` text,
   PRIMARY KEY (`id`),
   KEY `idx_finance_customer` (`finance_id`,`customer_id`),
   KEY `idx_customer_id` (`customer_id`),
   KEY `idx_due_date` (`due_date`),
   KEY `idx_hp_date` (`hpDate`),
   KEY `idx_broker_name` (`broker_name`),
   KEY `idx_dealer_name` (`dealer_name`),
   CONSTRAINT `fk_loans_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
   CONSTRAINT `fk_loans_finance` FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`) ON DELETE SET NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

 CREATE TABLE `owner` (
   `id` int NOT NULL AUTO_INCREMENT,
   `username` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
   `password` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
   `reset_token` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `reset_token_expiry` datetime DEFAULT NULL,
   `is_active` tinyint(1) DEFAULT '1',
   `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
   `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`),
   UNIQUE KEY `username` (`username`),
   KEY `idx_is_active` (`is_active`),
   KEY `idx_created_at` (`created_at`),
   KEY `idx_reset_token` (`reset_token`),
   KEY `idx_username_active` (`username`,`is_active`),
   KEY `idx_reset_token_expiry` (`reset_token_expiry`)
 ) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

 CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    finance_id INT NOT NULL,
    customer_id INT NOT NULL,
    dueDate DATE NOT NULL,
    emi_amount DECIMAL(15,2) NOT NULL,
    amount DECIMAL(15,2) DEFAULT 0,
    penalty DECIMAL(15,2) DEFAULT 0,
    status ENUM('pending','partial','paid') DEFAULT 'pending',
    payment_status ENUM('active','cancelled') DEFAULT 'active',
    paymentDate DATE NULL,
    billNumber VARCHAR(50),
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
 /*!50100 PARTITION BY RANGE (year(`paymentDate`))
 (PARTITION p2023 VALUES LESS THAN (2024) ENGINE = InnoDB,
  PARTITION p2024 VALUES LESS THAN (2025) ENGINE = InnoDB,
  PARTITION p2025 VALUES LESS THAN (2026) ENGINE = InnoDB,
  PARTITION p2026 VALUES LESS THAN (2027) ENGINE = InnoDB,
  PARTITION p_future VALUES LESS THAN MAXVALUE ENGINE = InnoDB) */



  CREATE TABLE sub_due (
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




  CREATE TABLE `recent_activity` (
   `id` int NOT NULL AUTO_INCREMENT,
   `finance_id` int NOT NULL,
   `type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
   `reference_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
   `description` text COLLATE utf8mb4_unicode_ci,
   `amount` decimal(15,2) DEFAULT NULL,
   `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`),
   KEY `idx_finance_id` (`finance_id`),
   KEY `idx_type` (`type`),
   KEY `idx_reference_id` (`reference_id`),
   KEY `idx_amount` (`amount`),
   KEY `idx_created_by` (`created_by`),
   KEY `idx_created_at` (`created_at`),
   KEY `idx_finance_date` (`finance_id`,`created_at`),
   FULLTEXT KEY `ft_description` (`description`),
   CONSTRAINT `fk_activity_finance` FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`) ON DELETE CASCADE
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC


 CREATE TABLE `users` (
   `id` int NOT NULL AUTO_INCREMENT,
   `user_id` varchar(36) NOT NULL,
   `email` varchar(255) NOT NULL,
   `username` varchar(100) NOT NULL,
   `phone_no` varchar(15) NOT NULL,
   `password` varchar(255) NOT NULL,
   `user_role` enum('owner','admin','agent','staff') NOT NULL,
   `allowed_companies` json DEFAULT (json_array()),
   `login_time_from` time DEFAULT NULL,
   `login_time_to` time DEFAULT NULL,
   `last_login` datetime DEFAULT NULL,
   `is_active` tinyint DEFAULT '1',
   `reset_token` varchar(255) DEFAULT NULL,
   `reset_token_expiry` datetime DEFAULT NULL,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   `partition_key` tinyint GENERATED ALWAYS AS ((crc32(`user_id`) % 8)) STORED NOT NULL,
   PRIMARY KEY (`id`,`partition_key`),
   UNIQUE KEY `uk_user_id` (`user_id`,`partition_key`),
   UNIQUE KEY `uk_email` (`email`,`partition_key`),
   UNIQUE KEY `uk_username` (`username`,`partition_key`),
   UNIQUE KEY `uk_phone_no` (`phone_no`,`partition_key`),
   KEY `idx_user_role` (`user_role`),
   KEY `idx_is_active` (`is_active`),
   KEY `idx_last_login` (`last_login`),
   KEY `idx_created_at` (`created_at`)
 ) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
 /*!50100 PARTITION BY HASH (`partition_key`)
 PARTITIONS 8 */


 CREATE TABLE `users_details` (
   `id` varchar(36) COLLATE utf8mb4_general_ci NOT NULL,
   `finance_id` int NOT NULL,
   `staff_name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
   `staff_code` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `father_spouse_name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `experience_years` int DEFAULT '0',
   `education_qualification` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `photo` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `joining_date` date DEFAULT NULL,
   `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`),
   UNIQUE KEY `uq_staff_code_finance` (`staff_code`,`finance_id`),
   KEY `idx_finance_id` (`finance_id`),
   KEY `idx_staff_name` (`staff_name`),
   KEY `idx_joining_date` (`joining_date`),
   KEY `idx_finance_staff_name` (`finance_id`,`staff_name`),
   KEY `idx_finance_joining_date` (`finance_id`,`joining_date`),
   KEY `idx_staff_code_finance_comp` (`staff_code`,`finance_id`,`staff_name`),
   KEY `idx_finance_created` (`finance_id`,`created_at`),
   CONSTRAINT `fk_users_details_finance` FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`) ON DELETE CASCADE
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci


 CREATE TABLE `vehicle_detail` (
   `id` int NOT NULL AUTO_INCREMENT,
   `finance_id` int DEFAULT NULL,
   `vehicle_info_id` int DEFAULT NULL,
   `vehicle_number` varchar(100) NOT NULL,
   `vehicle_modal` varchar(10) DEFAULT NULL,
   `chassis_number` varchar(255) DEFAULT NULL,
   `engine_number` varchar(255) DEFAULT NULL,
   `num_owner` int DEFAULT '1',
   `trip_driven` int DEFAULT '0',
   `color` varchar(100) DEFAULT NULL,
   `variant` varchar(100) DEFAULT NULL,
   `selling_price` decimal(12,2) DEFAULT NULL,
   `emi_from` decimal(10,2) DEFAULT NULL,
   `base_price` decimal(12,2) NOT NULL,
   `final_price` decimal(12,2) NOT NULL,
   `status` enum('available','hosted','sales','seized','sold') DEFAULT 'available',
   `created_date` date DEFAULT NULL,
   `selling_date` date DEFAULT NULL,
   `hosting_info` json DEFAULT NULL,
   `monthly_income_data` json DEFAULT NULL,
   `deal_type` enum('finance','consulting') NOT NULL,
   `rc_holder` enum('Company','customer','third_party','pending') DEFAULT 'Company',
   `rc_status` enum('original','duplicate','not_available') DEFAULT 'original',
   `fc_expiry_date` date DEFAULT NULL,
   `insurance_expiry_date` date DEFAULT NULL,
   `remarks` text,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`),
   UNIQUE KEY `uk_vehicle_number` (`vehicle_number`),
   UNIQUE KEY `uk_chassis` (`chassis_number`),
   UNIQUE KEY `uk_engine` (`engine_number`),
   KEY `idx_finance_id` (`finance_id`),
   KEY `idx_status` (`status`),
   KEY `idx_created_date` (`created_date`),
   KEY `idx_selling_date` (`selling_date`),
   KEY `fk_vehicle_info` (`vehicle_info_id`),
   KEY `idx_vehicle_prefix` ((left(`vehicle_number`,2))),
   CONSTRAINT `fk_vehicle_finance` FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`),
   CONSTRAINT `fk_vehicle_info` FOREIGN KEY (`vehicle_info_id`) REFERENCES `vehicle_info` (`id`) ON DELETE SET NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

 CREATE TABLE `vehicle_expenses` (
   `id` int NOT NULL AUTO_INCREMENT,
   `finance_id` int DEFAULT NULL,
   `vehicle_id` int NOT NULL,
   `expense_date` date NOT NULL,
   `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
   `amount` decimal(15,2) DEFAULT NULL,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`),
   KEY `idx_vehicle_id` (`vehicle_id`),
   KEY `idx_finance_id` (`finance_id`),
   KEY `idx_expense_date` (`expense_date`),
   KEY `idx_amount` (`amount`),
   KEY `idx_vehicle_date` (`vehicle_id`,`expense_date`),
   FULLTEXT KEY `ft_description` (`description`),
   CONSTRAINT `fk_expenses_finance` FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`) ON DELETE SET NULL,
   CONSTRAINT `fk_expenses_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicle_detail` (`id`) ON DELETE CASCADE
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC


 CREATE TABLE `vehicle_images` (
   `id` int NOT NULL AUTO_INCREMENT,
   `finance_id` int DEFAULT NULL,
   `vehicle_id` int NOT NULL,
   `image_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
   `image_type` enum('front','side','back','interior','additional') COLLATE utf8mb4_unicode_ci NOT NULL,
   `is_primary` tinyint DEFAULT '0',
   `file_size` int DEFAULT NULL,
   `upload_date` date DEFAULT NULL,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`),
   KEY `idx_vehicle_id` (`vehicle_id`),
   KEY `idx_finance_id` (`finance_id`),
   KEY `idx_image_type` (`image_type`),
   KEY `idx_is_primary` (`is_primary`),
   KEY `idx_upload_date` (`upload_date`),
   KEY `idx_vehicle_type` (`vehicle_id`,`image_type`),
   CONSTRAINT `fk_images_finance` FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`) ON DELETE SET NULL,
   CONSTRAINT `fk_images_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicle_detail` (`id`) ON DELETE CASCADE
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC

 CREATE TABLE `vehicle_info` (
   `id` int NOT NULL AUTO_INCREMENT,
   `brand` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
   `model_name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
   `make_year` year NOT NULL,
   `fuel_type` enum('petrol','diesel','electric','cng','hybrid') COLLATE utf8mb4_general_ci NOT NULL,
   `engine_capacity` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
   `fuel_tank_capacity` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `max_torque` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `top_speed` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `mileage` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
   `transmission` enum('manual','automatic','cvt','amt') COLLATE utf8mb4_general_ci DEFAULT NULL,
   `seating_capacity` int DEFAULT NULL,
   `body_type` enum('sedan','hatchback','suv','muv','coupe','convertible','scooter','bike') COLLATE utf8mb4_general_ci DEFAULT NULL,
   `base_price` decimal(12,2) NOT NULL,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`),
   KEY `idx_brand` (`brand`),
   KEY `idx_model_name` (`model_name`),
   KEY `idx_brand_model` (`brand`,`model_name`),
   KEY `idx_body_type` (`body_type`),
   KEY `idx_fuel_type` (`fuel_type`),
   KEY `idx_make_year` (`make_year`),
   KEY `idx_base_price` (`base_price`)
 ) ENGINE=InnoDB AUTO_INCREMENT=368 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci


CREATE TABLE seizing_vehicle (
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


CREATE TABLE office_expenses (
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
