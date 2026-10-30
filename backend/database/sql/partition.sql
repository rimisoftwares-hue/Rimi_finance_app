-- =============================================
-- RIMI FINANCE DATABASE - OPTIMIZED FOR RDS/AURORA
-- =============================================

-- Disable foreign key checks for faster imports
SET FOREIGN_KEY_CHECKS = 0;
SET UNIQUE_CHECKS = 0;
SET AUTOCOMMIT = 0;
SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';

-- Create database
CREATE DATABASE IF NOT EXISTS `RimiFinanceDesktopDB` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `RimiFinanceDesktopDB`;

-- =============================================
-- ADDRESSES TABLE (Unpartitioned for FK compatibility)
-- =============================================
CREATE TABLE `addresses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `house_no` VARCHAR(50),
  `street` VARCHAR(100),
  `street_name` VARCHAR(100),
  `village` VARCHAR(100),
  `land_mark` VARCHAR(100),
  `address` VARCHAR(225),
  `city` VARCHAR(100),
  `district` VARCHAR(100),
  `state` VARCHAR(100),
  `pincode` VARCHAR(10),
  `location` VARCHAR(255),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Optimized indexes for search
  INDEX `idx_state_city` (`state`, `city`),
  INDEX `idx_district_city` (`district`, `city`),
  INDEX `idx_pincode_city` (`pincode`, `city`),
  INDEX `idx_created_at` (`created_at`),
  
  -- Fulltext for address search
  FULLTEXT INDEX `ft_address` (`address`),
  FULLTEXT INDEX `ft_city_district` (`city`, `district`, `village`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
ROW_FORMAT=DYNAMIC;

-- =============================================
-- OWNER TABLE
-- =============================================
CREATE TABLE `owner` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(100) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `reset_token` VARCHAR(255),
  `reset_token_expiry` DATETIME,
  `is_active` TINYINT DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE INDEX `uk_username` (`username`),
  INDEX `idx_username_active` (`username`, `is_active`),
  INDEX `idx_reset_token` (`reset_token`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
ROW_FORMAT=DYNAMIC;

-- =============================================
-- FINANCE DETAIL TABLE (Partitioned by HASH)
-- =============================================
CREATE TABLE `finnance_detail` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `owner_id` INT NOT NULL,
  `finance_name` VARCHAR(255) NOT NULL,
  `phone_numbers` JSON NOT NULL,
  `emails` JSON,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY `uk_owner_finance` (`owner_id`, `finance_name`),
  KEY `idx_owner_id` (`owner_id`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_created_at` (`created_at`),
  FULLTEXT KEY `ft_finance_name` (`finance_name`),

  CONSTRAINT `fk_finance_owner`
    FOREIGN KEY (`owner_id`)
    REFERENCES `owner` (`id`)
)
PARTITION BY HASH(id)
PARTITIONS 8;

-- =============================================
-- USERS TABLE (Simplified structure)
-- =============================================

DROP TABLE IF EXISTS `users_details`;

CREATE TABLE `users_details` (
  `id` varchar(36) NOT NULL,
  `finance_id` int(11) NOT NULL,
  `staff_name` varchar(255) NOT NULL,
  `staff_code` varchar(50) DEFAULT NULL,
  `father_spouse_name` varchar(255) DEFAULT NULL,
  `experience_years` int(11) DEFAULT 0,
  `education_qualification` varchar(255) DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `joining_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_staff_code_finance` (`staff_code`, `finance_id`),
  
  -- Essential indexes for common queries
  KEY `idx_finance_id` (`finance_id`),
  KEY `idx_staff_name` (`staff_name`),
  KEY `idx_joining_date` (`joining_date`),
  -- Composite indexes for efficient joins and filtering
  KEY `idx_finance_staff_name` (`finance_id`, `staff_name`),
  KEY `idx_finance_joining_date` (`finance_id`, `joining_date`),
  KEY `idx_staff_code_finance_comp` (`staff_code`, `finance_id`, `staff_name`),
  KEY `idx_finance_created` (`finance_id`, `created_at`),
  
  -- Foreign key constraint
  CONSTRAINT `fk_users_details_finance` 
    FOREIGN KEY (`finance_id`) 
    REFERENCES `finance_detail` (`id`) 
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS users;

CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `username` VARCHAR(100) NOT NULL,
  `phone_no` VARCHAR(15) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `user_role` ENUM('owner','admin','agent','staff') NOT NULL,
  `allowed_companies` JSON DEFAULT (JSON_ARRAY()),
  `login_time_from` TIME,
  `login_time_to` TIME,
  `last_login` DATETIME,
  `is_active` TINYINT DEFAULT 1,
  `reset_token` VARCHAR(255),
  `reset_token_expiry` DATETIME,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  -- 🔥 Partition key derived from UUID
  `partition_key` TINYINT
    GENERATED ALWAYS AS (CRC32(user_id) % 8) STORED,

  -- 🔴 PRIMARY KEY MUST include partition key
  PRIMARY KEY (`id`, `partition_key`),

  -- 🔴 ALL UNIQUE keys MUST include partition key
  UNIQUE KEY `uk_user_id` (`user_id`, `partition_key`),
  UNIQUE KEY `uk_email` (`email`, `partition_key`),
  UNIQUE KEY `uk_username` (`username`, `partition_key`),
  UNIQUE KEY `uk_phone_no` (`phone_no`, `partition_key`),

  KEY `idx_user_role` (`user_role`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_last_login` (`last_login`),
  KEY `idx_created_at` (`created_at`)
)
ENGINE=InnoDB
PARTITION BY HASH(partition_key)
PARTITIONS 8;


-- DROP TABLE IF EXISTS `users`;
-- CREATE TABLE `users` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `user_id` VARCHAR(36) NOT NULL,
--   `email` VARCHAR(255) NOT NULL,
--   `username` VARCHAR(100) NOT NULL,
--   `phone_no` VARCHAR(13) NOT NULL,
--   `password` VARCHAR(255) NOT NULL,

--   `user_role` ENUM('owner','admin','agent','staff') NOT NULL,

--   `allowed_companies` JSON DEFAULT (JSON_ARRAY()),

--   `login_time_from` TIME DEFAULT NULL,
--   `login_time_to` TIME DEFAULT NULL,

--   `last_login` DATETIME DEFAULT NULL,
--   `is_active` TINYINT(1) DEFAULT 1,

--   `reset_token` VARCHAR(255) DEFAULT NULL,
--   `reset_token_expiry` DATETIME DEFAULT NULL,

--   `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   `updated_at` TIMESTAMP NOT NULL
--     DEFAULT CURRENT_TIMESTAMP
--     ON UPDATE CURRENT_TIMESTAMP,

--   /* 🔐 Partition-safe primary key */
--   PRIMARY KEY (`id`, `user_id`),

--   /* 🔑 Constraints */
--   UNIQUE KEY `uk_email` (`email`),
--   UNIQUE KEY `uk_username` (`username`),
--   UNIQUE KEY `uk_phone_no` (`phone_no`),

--   /* 🚀 Indexes */
--   KEY `idx_user_role` (`user_role`),
--   KEY `idx_is_active` (`is_active`),
--   KEY `idx_last_login` (`last_login`),
--   KEY `idx_allowed_companies` (`allowed_companies`(100)),

--   FULLTEXT KEY `idx_ft_username_email` (`username`, `email`),
--   CONSTRAINT `users_ibfk_1` FOREIGN KEY (`users_id`) REFERENCES `users_details` (`id`) ON DELETE CASCADE
-- )
-- ENGINE=InnoDB
-- DEFAULT CHARSET=utf8mb4
-- COLLATE=utf8mb4_general_ci

-- PARTITION BY HASH (CRC32(`user_id`))
-- PARTITIONS 8;

-- =============================================
-- VEHICLE INFO TABLE (Reference table, unpartitioned)
-- =============================================
DROP TABLE IF EXISTS `vehicle_info`;

CREATE TABLE `vehicle_info` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `brand` VARCHAR(100) NOT NULL,
  `model_name` VARCHAR(255) NOT NULL,
  `make_year` YEAR NOT NULL,
  `fuel_type` ENUM('petrol','diesel','electric','cng','hybrid') NOT NULL,
  `engine_capacity` VARCHAR(50) NOT NULL,
  `fuel_tank_capacity` VARCHAR(50),
  `max_torque` VARCHAR(50),
  `top_speed` VARCHAR(50),
  `mileage` VARCHAR(50),
  `transmission` ENUM('manual','automatic','cvt','amt'),
  `seating_capacity` INT,
  `body_type` ENUM(
    'sedan','hatchback','suv','muv',
    'coupe','convertible','scooter','bike'
  ),
  `base_price` DECIMAL(12,2) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),

  -- 🔥 Useful indexes instead of partitions
  KEY `idx_brand` (`brand`),
  KEY `idx_model_name` (`model_name`),
  KEY `idx_brand_model` (`brand`, `model_name`),
  KEY `idx_body_type` (`body_type`),
  KEY `idx_fuel_type` (`fuel_type`),
  KEY `idx_make_year` (`make_year`),
  KEY `idx_base_price` (`base_price`)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci;


CREATE TABLE `vehicle_detail` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `finance_id` INT,
  `vehicle_info_id` INT,
  `vehicle_number` VARCHAR(100) NOT NULL,
  `vehicle_modal` VARCHAR(10),
  `chassis_number` VARCHAR(255),
  `engine_number` VARCHAR(255),
  `num_owner` INT DEFAULT 1,
  `trip_driven` INT DEFAULT 0,
  `color` VARCHAR(100),
  `variant` VARCHAR(100),
  `selling_price` DECIMAL(12,2),
  `emi_from` DECIMAL(10,2),
  `base_price` DECIMAL(12,2) NOT NULL,
  `final_price` DECIMAL(12,2) NOT NULL,
  `status` ENUM('available','hosted','sales','seized','sold') DEFAULT 'available',
  `created_date` DATE,
  `selling_date` DATE,
  `hosting_info` JSON,
  `monthly_income_data` JSON,
  `deal_type` ENUM('finance','consulting') NOT NULL,
  `rc_holder` ENUM('Company','customer','third_party','pending') DEFAULT 'Company',
  `rc_status` ENUM('original','duplicate','not_available') DEFAULT 'original',
  `fc_expiry_date` DATE,
  `insurance_expiry_date` DATE,
  `remarks` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_vehicle_number (`vehicle_number`),
  UNIQUE KEY uk_chassis (`chassis_number`),
  UNIQUE KEY uk_engine (`engine_number`),
  KEY idx_vehicle_prefix ((LEFT(vehicle_number, 2))),
  KEY idx_finance_id (`finance_id`),
  KEY idx_status (`status`),
  KEY idx_created_date (`created_date`),
  KEY idx_selling_date (`selling_date`),
  
  CONSTRAINT fk_vehicle_finance
    FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`),

  CONSTRAINT fk_vehicle_info
    FOREIGN KEY (`vehicle_info_id`) REFERENCES `vehicle_info` (`id`)
    ON DELETE SET NULL
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4;

-- =============================================
-- VEHICLE DETAIL TABLE (Partitioned by region)
-- =============================================
-- CREATE TABLE `vehicle_detail` (
--   `id` INT AUTO_INCREMENT,
--   `finance_id` INT,
--   `vehicle_info_id` INT,
--   `vehicle_number` VARCHAR(20) NOT NULL,
--   `vehicle_modal` VARCHAR(10),
--   `chassis_number` VARCHAR(255),
--   `engine_number` VARCHAR(255),
--   `num_owner` INT DEFAULT 1,
--   `trip_driven` INT DEFAULT 0,
--   `color` VARCHAR(50) NOT NULL,
--   `variant` VARCHAR(100),
--   `selling_price` DECIMAL(12,2),
--   `emi_from` DECIMAL(10,2),
--   `base_price` DECIMAL(12,2),
--   `final_price` DECIMAL(12,2),
--   `status` ENUM('available','hosted','sales','seized','sold') DEFAULT 'available',
--   `created_date` DATE,
--   `selling_date` DATE,
--   `hosting_info` JSON,
--   `monthly_income_data` JSON,
--   `deal_type` ENUM('finance','consulting') NOT NULL,
--   `rc_holder` ENUM('Company','customer','third_party','pending') DEFAULT 'Company',
--   `rc_status` ENUM('original','duplicate','not_available') DEFAULT 'original',
--   `fc_expiry_date` DATE,
--   `insurance_expiry_date` DATE,
--   `remarks` TEXT,
--   `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   `partition_region` VARCHAR(10) GENERATED ALWAYS AS (
--     CASE 
--       WHEN LEFT(vehicle_number, 2) IN ('DL', 'HR', 'PB', 'CH', 'HP', 'JK', 'UK') THEN 'north'
--       WHEN LEFT(vehicle_number, 2) IN ('MH', 'GJ', 'RJ', 'MP', 'GA') THEN 'west'
--       WHEN LEFT(vehicle_number, 2) IN ('TN', 'AP', 'TS', 'KA', 'KL') THEN 'south'
--       WHEN LEFT(vehicle_number, 2) IN ('WB', 'BR', 'JH', 'OR', 'AS', 'MN', 'NL', 'AR', 'SK') THEN 'east'
--       ELSE 'other'
--     END
--   ) STORED,
  
--   PRIMARY KEY (`id`, `partition_region`),
  
--   UNIQUE INDEX `uk_vehicle_number` (`vehicle_number`),
--   UNIQUE INDEX `uk_chassis_number` (`chassis_number`),
--   UNIQUE INDEX `uk_engine_number` (`engine_number`),
  
--   INDEX `idx_finance_id` (`finance_id`),
--   INDEX `idx_vehicle_info_id` (`vehicle_info_id`),
--   INDEX `idx_status` (`status`),
--   INDEX `idx_created_date` (`created_date`),
--   INDEX `idx_selling_date` (`selling_date`),
--   INDEX `idx_region` (`partition_region`),
--   INDEX `idx_rc_holder` (`rc_holder`),
--   INDEX `idx_deal_type` (`deal_type`),
  
--   CONSTRAINT `fk_vehicle_finance` 
--     FOREIGN KEY (`finance_id`) 
--     REFERENCES `finance_detail` (`id`)
--     ON DELETE SET NULL,
--   CONSTRAINT `fk_vehicle_info` 
--     FOREIGN KEY (`vehicle_info_id`) 
--     REFERENCES `vehicle_info` (`id`)
--     ON DELETE SET NULL
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
-- PARTITION BY LIST COLUMNS (partition_region) (
--   PARTITION p_north VALUES IN ('north'),
--   PARTITION p_south VALUES IN ('south'),
--   PARTITION p_east VALUES IN ('east'),
--   PARTITION p_west VALUES IN ('west'),
--   PARTITION p_other VALUES IN ('other')
-- )
-- ROW_FORMAT=DYNAMIC;

-- =============================================
-- CUSTOMERS TABLE (Partitioned by HPLNO)
-- =============================================
DROP TABLE IF EXISTS `customers`;

-- CREATE TABLE `customers` (
--   `id` INT AUTO_INCREMENT,
--   `finance_id` INT,
--   `hplno` INT NOT NULL,
--   `loanStatus` ENUM('active','close','seized') NOT NULL,
--   `brokerName` VARCHAR(100),
--   `cname` VARCHAR(100) NOT NULL,
--   `cfname_value` VARCHAR(100),
--   `cfname_unit` VARCHAR(10),
--   `cphoto` VARCHAR(255),
--   `cvehiclePhoto` VARCHAR(255),
--   `cpropertyPhoto` VARCHAR(255),
--   `vehicle_id` INT,
--   `aadhar_id` VARCHAR(12),
--   `other_govt_id_type` ENUM('pan_card','voter_id','driving_license','other'),
--   `other_govt_id_number` VARCHAR(50),
--   `profession` VARCHAR(100),
--   `work_office_address` TEXT,
--   `work_office_phone` VARCHAR(15),
--   `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
--   PRIMARY KEY (`id`, `hplno`),
  
--   UNIQUE INDEX `uk_aadhar_id` (`aadhar_id`),
--   INDEX `idx_finance_id` (`finance_id`),
--   INDEX `idx_hplno` (`hplno`),
--   INDEX `idx_loan_status` (`loanStatus`),
--   INDEX `idx_profession` (`profession`),
--   INDEX `idx_created_at` (`created_at`),
--   INDEX `idx_vehicle_id` (`vehicle_id`),
--   INDEX `idx_finance_hplno` (`finance_id`, `hplno`),
  
--   FULLTEXT INDEX `ft_cname` (`cname`),
  
--   CONSTRAINT `fk_customers_finance` 
--     FOREIGN KEY (`finance_id`) 
--     REFERENCES `finance_detail` (`id`)
--     ON DELETE SET NULL,
--   CONSTRAINT `fk_customers_vehicle` 
--     FOREIGN KEY (`vehicle_id`) 
--     REFERENCES `vehicle_detail` (`id`)
--     ON DELETE SET NULL
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
-- PARTITION BY HASH(hplno)
-- PARTITIONS 16
-- ROW_FORMAT=DYNAMIC;

CREATE TABLE `customers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `finance_id` INT,
  `hplno` INT NOT NULL,
  `loanStatus` ENUM('active','close','seized') NOT NULL,
  `brokerName` VARCHAR(100),
  `cname` VARCHAR(100) NOT NULL,
  `cfname_value` VARCHAR(100),
  `cfname_unit` VARCHAR(10),
  `cphoto` VARCHAR(255),
  `cvehiclePhoto` VARCHAR(255),
  `cpropertyPhoto` VARCHAR(255),
  `vehicle_id` INT,
  `aadhar_id` VARCHAR(12),
  `other_govt_id_type` ENUM('pan_card','voter_id','driving_license','other'),
  `other_govt_id_number` VARCHAR(50),
  `profession` VARCHAR(100),
  `work_office_address` TEXT,
  `work_office_phone` VARCHAR(15),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_aadhar_id (`aadhar_id`),
  KEY idx_finance_hplno (`finance_id`, `hplno`),
  KEY idx_loan_status (`loanStatus`),
  KEY idx_vehicle_id (`vehicle_id`),

  CONSTRAINT fk_customers_finance
    FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`)
    ON DELETE SET NULL,

  CONSTRAINT fk_customers_vehicle
    FOREIGN KEY (`vehicle_id`) REFERENCES `vehicle_detail` (`id`)
    ON DELETE SET NULL
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4;


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
-- =============================================
-- GUARDIANS TABLE
-- =============================================
CREATE TABLE `guardians` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `finance_id` INT,
  `customer_id` INT NOT NULL,
  `gname` VARCHAR(100) NOT NULL,
  `gfname_value` VARCHAR(100),
  `gfname_unit` VARCHAR(10),
  `gphoto` VARCHAR(255),
  `gpropertyPhoto` VARCHAR(255),
  `aadhar_id` VARCHAR(12),
  `other_govt_id_type` ENUM('pan_card','voter_id','driving_license','other'),
  `other_govt_id_number` VARCHAR(50),
  `profession` VARCHAR(100),
  `remarks` VARCHAR(100),
  `work_office_address` TEXT,
  `work_office_phone` VARCHAR(15),
  
  UNIQUE INDEX `uk_aadhar_id` (`aadhar_id`),
  INDEX `idx_customer_id` (`customer_id`),
  INDEX `idx_finance_id` (`finance_id`),
  INDEX `idx_profession` (`profession`),
  INDEX `idx_finance_customer` (`finance_id`, `customer_id`),
  
  FULLTEXT INDEX `ft_gname` (`gname`),
  
  CONSTRAINT `fk_guardians_customer` 
    FOREIGN KEY (`customer_id`) 
    REFERENCES `customers` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_guardians_finance` 
    FOREIGN KEY (`finance_id`) 
    REFERENCES `finance_detail` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
ROW_FORMAT=DYNAMIC;

-- =============================================
-- LOANS TABLE (Partitioned by customer)
-- =============================================
-- CREATE TABLE `loans` (
--   `id` INT AUTO_INCREMENT,
--   `finance_id` INT,
--   `customer_hplno` INT NOT NULL,
--   `loan_type` VARCHAR(50) NOT NULL,
--   `hpAmount` DECIMAL(15,2),
--   `hpDate` DATE,
--   `due_date` DATE,
--   `dueMonth` INT,
--   `interestRate` DECIMAL(5,2),
--   `penaltyAmount` DECIMAL(15,2),
--   `principle_part` DECIMAL(15,2),
--   `interest_part` DECIMAL(15,2),
--   `dueAmount` DECIMAL(15,2),
--   `down_payment` DECIMAL(15,2),
--   `pay_mode` ENUM('cash','online','bank','upi','cheque','other'),
--   `net_payment` DECIMAL(15,2),
--   `net_payable` DECIMAL(15,2),
--   `pay_mode_1` ENUM('cash','online','bank','upi','cheque','other'),
--   `pay_mode_1_amount` DECIMAL(15,2),
--   `hand_loan` DECIMAL(15,2),
--   `hand_loan_remarks` TEXT,
--   `broker_name` VARCHAR(100),
--   `dealer_name` VARCHAR(100),
--   `documentation_charge` DECIMAL(15,2),
--   `broker_commission` DECIMAL(15,2),
--   `remarks` TEXT,
--   `partition_key` TINYINT GENERATED ALWAYS AS (customer_hplno % 16) STORED,
  
--   PRIMARY KEY (`id`, `partition_key`),
  
--   INDEX `idx_customer_hplno` (`customer_hplno`),
--   INDEX `idx_finance_id` (`finance_id`),
--   INDEX `idx_loan_type` (`loan_type`),
--   INDEX `idx_hp_date` (`hpDate`),
--   INDEX `idx_due_date` (`due_date`),
--   INDEX `idx_hp_amount` (`hpAmount`),
--   INDEX `idx_due_amount` (`dueAmount`),
--   INDEX `idx_broker_name` (`broker_name`),
--   INDEX `idx_finance_customer` (`finance_id`, `customer_hplno`),
  
--   CONSTRAINT `fk_loans_customer` 
--     FOREIGN KEY (`customer_hplno`) 
--     REFERENCES `customers` (`hplno`)
--     ON DELETE CASCADE,
--   CONSTRAINT `fk_loans_finance` 
--     FOREIGN KEY (`finance_id`) 
--     REFERENCES `finance_detail` (`id`)
--     ON DELETE SET NULL
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
-- PARTITION BY HASH(partition_key)
-- PARTITIONS 16
-- ROW_FORMAT=DYNAMIC;
CREATE TABLE `loans` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `finance_id` INT,
  `customer_id` INT NOT NULL,
  `loan_type` VARCHAR(50) NOT NULL,
  `hpAmount` DECIMAL(15,2),
  `hpDate` DATE,
  `due_date` DATE,
  `dueMonth` INT,
  `interestRate` DECIMAL(5,2),
  `penaltyAmount` DECIMAL(15,2),
  `principle_part` DECIMAL(15,2),
  `interest_part` DECIMAL(15,2),
  `dueAmount` DECIMAL(15,2),
  `down_payment` DECIMAL(15,2),
  `pay_mode` ENUM('cash','online','bank','upi','cheque','other'),
  `net_payment` DECIMAL(15,2),
  `net_payable` DECIMAL(15,2),
  `pay_mode_1` ENUM('cash','online','bank','upi','cheque','other'),
  `pay_mode_1_amount` DECIMAL(15,2),
  `hand_loan` DECIMAL(15,2),
  `hand_loan_remarks` TEXT,
  `broker_name` VARCHAR(100),
  `dealer_name` VARCHAR(100),
  `documentation_charge` DECIMAL(15,2),
  `broker_commission` DECIMAL(15,2),
  `remarks` TEXT,

  KEY idx_finance_customer (`finance_id`, `customer_id`),
  KEY idx_customer_id (`customer_id`),
  KEY idx_due_date (`due_date`),
  KEY idx_hp_date (`hpDate`),
  KEY idx_broker_name (`broker_name`),
  KEY idx_dealer_name (`dealer_name`),
  

  CONSTRAINT fk_loans_customer
    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
    ON DELETE CASCADE,

  CONSTRAINT fk_loans_finance
    FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`)
    ON DELETE SET NULL
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4;


-- =============================================
-- PAYMENTS TABLE (Range + Hash Partitioning)
-- =============================================
DROP TABLE IF EXISTS payments;

CREATE TABLE `payments` (
  `id` INT AUTO_INCREMENT,
  `finance_id` INT,
  `customer_id` INT NOT NULL,
  `dueDate` DATE,
  `paymentDate` DATE NOT NULL,
  `billNumber` VARCHAR(50),
  `amount` DECIMAL(15,2),
  `penalty` DECIMAL(15,2),
  `collected_by` VARCHAR(100),
  `hand_loan` DECIMAL(15,2),
  `hand_loan_remark` TEXT,
  `payment_mode` ENUM('cash','online','bank','upi','cheque','other'),
  `payment_mode_1` ENUM('cash','online','bank','upi','cheque','other'),
  `payment_mode_1_amount` DECIMAL(15,2),
  `remarks` TEXT,
  `edited_by` VARCHAR(100),
  `edited_at` TIMESTAMP,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 🔴 PRIMARY KEY must include partition column
  PRIMARY KEY (`id`, `paymentDate`),

  KEY idx_customer_id (`customer_id`),
  KEY idx_finance_id (`finance_id`),
  KEY idx_payment_date (`paymentDate`),
  KEY idx_due_date (`dueDate`),
  KEY idx_bill_number (`billNumber`),
  KEY idx_payment_mode (`payment_mode`),
  KEY idx_finance_customer_date (`finance_id`, `customer_id`, `paymentDate`)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (YEAR(paymentDate)) (
  PARTITION p2023 VALUES LESS THAN (2024),
  PARTITION p2024 VALUES LESS THAN (2025),
  PARTITION p2025 VALUES LESS THAN (2026),
  PARTITION p2026 VALUES LESS THAN (2027),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);


-- =============================================
-- CONTACTS TABLE
-- =============================================
CREATE TABLE `contacts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_hplno` INT NOT NULL,
  `contact_type` ENUM('customer','guardian') NOT NULL,
  `type` ENUM('mobile','landline','work') NOT NULL,
  `number` VARCHAR(20) NOT NULL,
  `finance_id` INT,
  
  INDEX `idx_customer_hplno` (`customer_hplno`),
  INDEX `idx_contact_type` (`contact_type`),
  INDEX `idx_number` (`number`),
  INDEX `idx_finance_id` (`finance_id`),
  INDEX `idx_customer_type` (`customer_hplno`, `contact_type`),
  UNIQUE INDEX `uk_customer_number_type` (`customer_hplno`, `number`, `contact_type`),
  
  CONSTRAINT `fk_contacts_customer` 
    FOREIGN KEY (`customer_hplno`) 
    REFERENCES `customers` (`hplno`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_contacts_finance` 
    FOREIGN KEY (`finance_id`) 
    REFERENCES `finance_detail` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
ROW_FORMAT=DYNAMIC;

-- =============================================
-- ADDRESS HISTORY TABLE
-- =============================================
CREATE TABLE `address_history` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `entity_type` ENUM('customer','guardian','user','finance') NOT NULL,
  `entity_id` VARCHAR(50) NOT NULL,
  `address_id` INT NOT NULL,
  `is_current` TINYINT DEFAULT 1,
  `changed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX `idx_entity_type_id` (`entity_type`, `entity_id`),
  INDEX `idx_address_id` (`address_id`),
  INDEX `idx_is_current` (`is_current`),
  INDEX `idx_changed_at` (`changed_at`),
  INDEX `idx_entity_address` (`entity_type`, `entity_id`, `address_id`),
  
  CONSTRAINT `fk_address_history_address` 
    FOREIGN KEY (`address_id`) 
    REFERENCES `addresses` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
ROW_FORMAT=DYNAMIC;

-- =============================================
-- HISTORY ENTRIES TABLE
-- =============================================
CREATE TABLE `history_entries` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `finance_id` INT,
  `customer_id` INT NOT NULL,
  `entry_type` ENUM('call','rc_book') NOT NULL,
  `message` TEXT NOT NULL,
  `entry_date` DATE NOT NULL,
  `created_by` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX `idx_customer_id` (`customer_id`),
  INDEX `idx_finance_id` (`finance_id`),
  INDEX `idx_entry_type` (`entry_type`),
  INDEX `idx_entry_date` (`entry_date`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_customer_date` (`customer_id`, `entry_date`),
  INDEX `idx_finance_customer` (`finance_id`, `customer_id`),
  
  FULLTEXT INDEX `ft_message` (`message`),
  
  CONSTRAINT `fk_history_customer` 
    FOREIGN KEY (`customer_id`) 
    REFERENCES `customers` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_history_finance` 
    FOREIGN KEY (`finance_id`) 
    REFERENCES `finance_detail` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
ROW_FORMAT=DYNAMIC;

-- =============================================
-- VEHICLE EXPENSES TABLE
-- =============================================
CREATE TABLE `vehicle_expenses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `finance_id` INT,
  `vehicle_id` INT NOT NULL,
  `expense_date` DATE NOT NULL,
  `description` VARCHAR(500) NOT NULL,
  `amount` DECIMAL(15,2),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX `idx_vehicle_id` (`vehicle_id`),
  INDEX `idx_finance_id` (`finance_id`),
  INDEX `idx_expense_date` (`expense_date`),
  INDEX `idx_amount` (`amount`),
  INDEX `idx_vehicle_date` (`vehicle_id`, `expense_date`),
  
  FULLTEXT INDEX `ft_description` (`description`),
  
  CONSTRAINT `fk_expenses_vehicle` 
    FOREIGN KEY (`vehicle_id`) 
    REFERENCES `vehicle_detail` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_expenses_finance` 
    FOREIGN KEY (`finance_id`) 
    REFERENCES `finance_detail` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
ROW_FORMAT=DYNAMIC;

-- =============================================
-- VEHICLE IMAGES TABLE
-- =============================================
CREATE TABLE `vehicle_images` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `finance_id` INT,
  `vehicle_id` INT NOT NULL,
  `image_url` VARCHAR(500) NOT NULL,
  `image_type` ENUM('front','side','back','interior','additional') NOT NULL,
  `is_primary` TINYINT DEFAULT 0,
  `file_size` INT,
  `upload_date` DATE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX `idx_vehicle_id` (`vehicle_id`),
  INDEX `idx_finance_id` (`finance_id`),
  INDEX `idx_image_type` (`image_type`),
  INDEX `idx_is_primary` (`is_primary`),
  INDEX `idx_upload_date` (`upload_date`),
  INDEX `idx_vehicle_type` (`vehicle_id`, `image_type`),
  
  CONSTRAINT `fk_images_vehicle` 
    FOREIGN KEY (`vehicle_id`) 
    REFERENCES `vehicle_detail` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_images_finance` 
    FOREIGN KEY (`finance_id`) 
    REFERENCES `finance_detail` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
ROW_FORMAT=DYNAMIC;

-- =============================================
-- RECENT ACTIVITY TABLE
-- =============================================
CREATE TABLE `recent_activity` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `finance_id` INT NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `reference_id` VARCHAR(100),
  `description` TEXT,
  `amount` DECIMAL(15,2),
  `created_by` VARCHAR(100),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX `idx_finance_id` (`finance_id`),
  INDEX `idx_type` (`type`),
  INDEX `idx_reference_id` (`reference_id`),
  INDEX `idx_amount` (`amount`),
  INDEX `idx_created_by` (`created_by`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_finance_date` (`finance_id`, `created_at`),
  
  FULLTEXT INDEX `ft_description` (`description`),
  
  CONSTRAINT `fk_activity_finance` 
    FOREIGN KEY (`finance_id`) 
    REFERENCES `finance_detail` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
ROW_FORMAT=DYNAMIC;

-- =============================================
-- INSERT SAMPLE DATA
-- =============================================

-- Owner data
INSERT INTO `owner` (`username`, `password`, `is_active`) VALUES
('Sanjay_rithik', 'sanjay', 1),
('sathish', 'sathish', 1);

-- Finance detail data
INSERT INTO `finance_detail` (`owner_id`, `finance_name`, `phone_numbers`, `emails`, `since`, `is_active`) VALUES
(1, 'Senthur', '["8870705545","9629666048"]', '[]', '2019', 1),
(1, 'thiru murugan', '[]', '[]', NULL, 1),
(1, 'ABC FINANCE', '["6380201002","6380647480"]', '["info@gamil.com"]', '2019', 1),
(1, 'SENTHIL FINANCE', '["6380647480","6380201002"]', '["info@senthilfinance.com"]', '2019', 1);

-- Users data
INSERT INTO `users` (`user_id`, `email`, `username`, `phone_no`, `password`, `user_role`, `finance_id`, `allowed_companies`, `is_active`) VALUES
('1', 'vell@gmail.com', 'vell', '7575757575', 'vell', 'owner', 1, '[1,2]', 1),
('e2e576bd-309f-11f0-983a-505bc2d9ca94', 'owner@example.com', 'usersanjay', '9876543210', 'sanjay', 'owner', 1, '[1]', 1);

-- Vehicle info data
INSERT INTO `vehicle_info` (`brand`, `model_name`, `make_year`, `fuel_type`, `engine_capacity`, `body_type`, `base_price`) VALUES
('Bajaj', 'Pulsar 150', 2023, 'petrol', '149.5cc', 'bike', 120000.00),
('Maruti Suzuki', 'Swift', 2024, 'petrol', '1197cc', 'hatchback', 750000.00),
('Hyundai', 'Creta', 2024, 'diesel', '1493cc', 'suv', 1500000.00);

-- Re-enable constraints
COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
SET UNIQUE_CHECKS = 1;
SET AUTOCOMMIT = 1;

-- =============================================
-- CREATE STORED PROCEDURES FOR COMMON OPERATIONS
-- =============================================
DELIMITER //

-- Procedure to get customer details with address
CREATE PROCEDURE GetCustomerDetails(IN p_customer_hplno INT, IN p_finance_id INT)
BEGIN
    SELECT 
        c.*,
        a.*,
        v.vehicle_number,
        v.vehicle_modal,
        vi.brand,
        vi.model_name
    FROM customers c
    LEFT JOIN address_history ah ON 
        ah.entity_type = 'customer' 
        AND ah.entity_id = c.hplno 
        AND ah.is_current = 1
    LEFT JOIN addresses a ON ah.address_id = a.id
    LEFT JOIN vehicle_detail v ON c.vehicle_id = v.id
    LEFT JOIN vehicle_info vi ON v.vehicle_info_id = vi.id
    WHERE c.hplno = p_customer_hplno
    AND (c.finance_id = p_finance_id OR p_finance_id IS NULL);
END //

-- Procedure to get loan summary
CREATE PROCEDURE GetLoanSummary(IN p_finance_id INT, IN p_start_date DATE, IN p_end_date DATE)
BEGIN
    SELECT 
        c.hplno,
        c.cname,
        l.loan_type,
        l.hpAmount,
        l.dueAmount,
        l.hpDate,
        l.due_date,
        SUM(p.amount) as total_paid,
        (l.dueAmount - COALESCE(SUM(p.amount), 0)) as balance_amount
    FROM loans l
    JOIN customers c ON l.customer_hplno = c.hplno
    LEFT JOIN payments p ON l.customer_hplno = p.customer_hplno
    WHERE l.finance_id = p_finance_id
    AND l.hpDate BETWEEN p_start_date AND p_end_date
    GROUP BY l.id, c.hplno, c.cname, l.loan_type, l.hpAmount, l.dueAmount, l.hpDate, l.due_date;
END //

DELIMITER ;

-- =============================================
-- CREATE VIEWS FOR REPORTING
-- =============================================

-- View for active loans
CREATE VIEW vw_active_loans AS
SELECT 
    f.finance_name,
    c.hplno,
    c.cname,
    l.loan_type,
    l.hpAmount,
    l.dueAmount,
    l.hpDate,
    l.due_date,
    (SELECT SUM(amount) FROM payments p WHERE p.customer_hplno = c.hplno) as total_paid,
    (l.dueAmount - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.customer_hplno = c.hplno), 0)) as balance_due
FROM loans l
JOIN customers c ON l.customer_hplno = c.hplno
JOIN finance_detail f ON l.finance_id = f.id
WHERE c.loanStatus = 'active'
AND l.dueAmount > 0;

-- View for vehicle inventory
CREATE VIEW vw_vehicle_inventory AS
SELECT 
    f.finance_name,
    v.vehicle_number,
    vi.brand,
    vi.model_name,
    vi.make_year,
    v.color,
    v.final_price,
    v.status,
    v.created_date,
    v.selling_date
FROM vehicle_detail v
JOIN finance_detail f ON v.finance_id = f.id
JOIN vehicle_info vi ON v.vehicle_info_id = vi.id
WHERE v.status IN ('available', 'hosted');

-- =============================================
-- CREATE PERFORMANCE OPTIMIZATION INDEXES
-- =============================================

-- Composite indexes for better join performance
ALTER TABLE `payments` 
ADD INDEX `idx_payments_composite` (`finance_id`, `customer_hplno`, `paymentDate`);

ALTER TABLE `loans`
ADD INDEX `idx_loans_composite` (`finance_id`, `customer_hplno`, `hpDate`);

ALTER TABLE `customers`
ADD INDEX `idx_customers_composite` (`finance_id`, `loanStatus`, `created_at`);

ALTER TABLE `vehicle_detail`
ADD INDEX `idx_vehicle_composite` (`finance_id`, `status`, `created_date`);

-- =============================================
-- FINAL OPTIMIZATION COMMANDS
-- =============================================

-- Analyze tables for query optimization
ANALYZE TABLE 
  addresses, owner, finance_detail, users, 
  vehicle_info, vehicle_detail, customers, 
  guardians, loans, payments, contacts, 
  address_history, history_entries, 
  vehicle_expenses, vehicle_images, recent_activity;

-- Flush privileges
FLUSH PRIVILEGES;

-- Show table status
SHOW TABLE STATUS FROM `RimiFinanceDesktopDB`;

-- =============================================
-- IMPORT INSTRUCTIONS FOR MYSQL WORKBENCH:
-- =============================================
/*
1. Connect to your RDS instance in MySQL Workbench
2. Open this SQL file
3. Execute the entire script (CTRL+SHIFT+ENTER)
4. For large data imports, consider:
   a) Using MySQL Workbench Data Import Wizard
   b) Using mysqldump with --compress flag
   c) Using LOAD DATA INFILE for CSV imports
   d) Disabling binary logging during import:
      SET sql_log_bin = 0;
      ... import commands ...
      SET sql_log_bin = 1;

5. Monitor performance in AWS RDS Console
6. Adjust RDS parameter group if needed:
   - innodb_buffer_pool_size (70% of instance memory)
   - innodb_log_file_size
   - max_connections
*/

-- Display completion message
SELECT 'Database setup completed successfully!' AS Message;