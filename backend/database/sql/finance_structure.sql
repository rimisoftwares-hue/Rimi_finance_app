CREATE DATABASE  IF NOT EXISTS `RimiFinanceDesktopDB` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `RimiFinanceDesktopDB`;

-- Remove partitioning to allow foreign keys
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

  KEY `idx_state` (`state`),
  KEY `idx_district` (`district`),
  KEY `idx_city` (`city`),
  KEY `idx_pincode` (`pincode`),
  KEY `idx_village` (`village`),
  KEY `idx_state_city` (`state`, `city`),
  KEY `idx_created_at` (`created_at`),

  FULLTEXT KEY `idx_ft_address` (`address`),
  FULLTEXT KEY `idx_ft_city_district` (`city`, `district`)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci;



DROP TABLE IF EXISTS `owner`;
CREATE TABLE `owner` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `reset_token` varchar(255) DEFAULT NULL,
  `reset_token_expiry` datetime DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_reset_token` (`reset_token`),
  KEY `idx_username_active` (`username`, `is_active`),
  KEY `idx_reset_token_expiry` (`reset_token_expiry`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `finance_detail`;
CREATE TABLE `finnance_detail` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `owner_id` int(11) DEFAULT NULL,
  `finance_name` varchar(255) NOT NULL,
  `phone_numbers` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT json_array() CHECK (json_valid(`phone_numbers`)),
  `emails` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT json_array() CHECK (json_valid(`emails`)),
  `finance_photo` varchar(255) DEFAULT NULL,
  `since` varchar(20) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  
  /* 🔥 Partition by ID hash for distribution */
  `partition_key` TINYINT GENERATED ALWAYS AS (id % 8) STORED,
  
  PRIMARY KEY (`id`, `partition_key`),
  KEY `idx_owner_id` (`owner_id`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_finance_name` (`finance_name`(100)),
  KEY `idx_created_at` (`created_at`),
  FULLTEXT KEY `idx_ft_finance_name` (`finance_name`),
  CONSTRAINT `fk_finance_owner` FOREIGN KEY (`owner_id`) REFERENCES `owner` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
PARTITION BY HASH(partition_key)
PARTITIONS 8;

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
  
  -- Hash partition by id (UUID converted to integer)
  `partition_key` TINYINT GENERATED ALWAYS AS (CRC32(id) % 8) STORED,
  
  PRIMARY KEY (`id`, `partition_key`),
  UNIQUE KEY `uq_staff_code` (`staff_code`),
  
  KEY `idx_finance_id` (`finance_id`),
  KEY `idx_staff_name` (`staff_name`),
  KEY `idx_joining_date` (`joining_date`),
  KEY `idx_experience` (`experience_years`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_finance_staff` (`finance_id`, `staff_name`),
  KEY `idx_finance_join` (`finance_id`, `joining_date`),
  KEY `idx_staff_code_finance` (`staff_code`, `finance_id`),
  
  -- Fulltext for name search
  FULLTEXT KEY `idx_ft_staff_name` (`staff_name`),
  FULLTEXT KEY `idx_ft_qualification` (`education_qualification`),
  
  CONSTRAINT `users_details_ibfk_1` FOREIGN KEY (`finance_id`) REFERENCES `finnance_detail` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
PARTITION BY HASH(partition_key)
PARTITIONS 8;

DROP TABLE IF EXISTS `users_new`;
CREATE TABLE `users_new` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `username` VARCHAR(100) NOT NULL,
  `phone_no` VARCHAR(13) NOT NULL,
  `password` VARCHAR(255) NOT NULL,

  `user_role` ENUM('owner','admin','agent','staff') NOT NULL,

  `allowed_companies` JSON DEFAULT (JSON_ARRAY()),

  `login_time_from` TIME DEFAULT NULL,
  `login_time_to` TIME DEFAULT NULL,

  `last_login` DATETIME DEFAULT NULL,
  `is_active` TINYINT(1) DEFAULT 1,

  `reset_token` VARCHAR(255) DEFAULT NULL,
  `reset_token_expiry` DATETIME DEFAULT NULL,

  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  /* 🔐 Partition-safe primary key */
  PRIMARY KEY (`id`, `user_id`),

  /* 🔑 Constraints */
  UNIQUE KEY `uk_user_id` (`user_id`),
  UNIQUE KEY `uk_email` (`email`),
  UNIQUE KEY `uk_username` (`username`),
  UNIQUE KEY `uk_phone_no` (`phone_no`),

  /* 🚀 Indexes */
  KEY `idx_user_role` (`user_role`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_last_login` (`last_login`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_allowed_companies` (`allowed_companies`(100)),

  FULLTEXT KEY `idx_ft_username_email` (`username`, `email`)
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`users_id`) REFERENCES `users_details` (`id`) ON DELETE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci

PARTITION BY HASH (CRC32(`user_id`))
PARTITIONS 8;


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

DROP TABLE IF EXISTS `customers`;
CREATE TABLE `customers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `finance_id` int(11) DEFAULT NULL,
  `hplno` int(11) NOT NULL,
  `loanStatus` enum('active','close','seized') NOT NULL,
  `brokerName` varchar(100) DEFAULT NULL,
  `cname` varchar(100) DEFAULT NULL,
  `cfname_value` varchar(100) DEFAULT NULL,
  `cfname_unit` varchar(10) DEFAULT NULL,
  `cphoto` varchar(255) DEFAULT NULL,
  `cvehiclePhoto` varchar(255) DEFAULT NULL,
  `cpropertyPhoto` varchar(255) DEFAULT NULL,
  `vehicle_id` int(11) DEFAULT NULL,
  `aadhar_id` varchar(12) DEFAULT NULL,
  `other_govt_id_type` enum('pan_card','voter_id','driving_license','other') DEFAULT NULL,
  `other_govt_id_number` varchar(50) DEFAULT NULL,
  `profession` varchar(100) DEFAULT NULL,
  `work_office_address` text DEFAULT NULL,
  `work_office_phone` varchar(15) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `aadhar_key` varchar(12) GENERATED ALWAYS AS (ifnull(`aadhar_id`,'NA')) STORED,
  
  /* 🔥 Partition by HPLNO hash for even distribution */
--   `partition_key` TINYINT GENERATED ALWAYS AS (hplno % 10) STORED,
  
  PRIMARY KEY (`id`, `hplno`),
  UNIQUE KEY `idx_aadhar_unique` (`aadhar_id`),
  KEY `idx_profession` (`profession`),
  KEY `idx_loan_status` (`loanStatus`),
  KEY `idx_finance_id` (`finance_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_hplno_hash` (`hplno`),
  KEY `idx_finance_hplno` (`finance_id`, `hplno`);
  KEY `fk_customers_vehicle` (`vehicle_id`),
  CONSTRAINT `fk_customers_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicle_detail` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
PARTITION BY HASH(hplno) PARTITIONS 10;


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

-- Fixed table name typo: 'finnance_detail' to 'finance_detail'
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
DROP TABLE IF EXISTS `guardians`;
CREATE TABLE `guardians` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `finance_id` int(11) DEFAULT NULL,
  `customer_hplno` int(11) DEFAULT NULL,
  `gname` varchar(100) DEFAULT NULL,
  `gfname_value` varchar(100) DEFAULT NULL,
  `gfname_unit` varchar(10) DEFAULT NULL,
  `gphoto` varchar(255) DEFAULT NULL,
  `gpropertyPhoto` varchar(255) DEFAULT NULL,
  `aadhar_id` varchar(12) DEFAULT NULL,
  `other_govt_id_type` enum('pan_card','voter_id','driving_license','other') DEFAULT NULL,
  `other_govt_id_number` varchar(50) DEFAULT NULL,
  `profession` varchar(100) DEFAULT NULL,
  `remarks` varchar(100) DEFAULT NULL,
  `work_office_address` text DEFAULT NULL,
  `work_office_phone` varchar(15) DEFAULT NULL,
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_aadhar_id` (`aadhar_id`),
  UNIQUE KEY `uq_other_govt_id_number` (`other_govt_id_number`),
  
  KEY `idx_customer_hplno` (`customer_hplno`),
  KEY `idx_finance_id` (`finance_id`),
  KEY `idx_aadhar` (`aadhar_id`),
  KEY `idx_profession` (`profession`),
  KEY `idx_gname` (`gname`),
  KEY `idx_customer_profession` (`customer_hplno`, `profession`),
  KEY `idx_finance_customer` (`finance_id`, `customer_hplno`),
  KEY `idx_govt_id_type` (`other_govt_id_type`),
  KEY `idx_hplno_aadhar` (`customer_hplno`, `aadhar_id`),
  
  FULLTEXT KEY `idx_ft_gname` (`gname`),
  FULLTEXT KEY `idx_ft_remarks` (`remarks`),
  
  CONSTRAINT `fk_guardians_customer` FOREIGN KEY (`customer_hplno`) REFERENCES `customers` (`hplno`) ON DELETE CASCADE,
  CONSTRAINT `fk_guardians_finance` FOREIGN KEY (`finance_id`) REFERENCES `finance_detail` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `address_history`;
CREATE TABLE `address_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `entity_type` enum('customer','guardian','user','finance') DEFAULT NULL,
  `entity_id` varchar(50) DEFAULT NULL,
  `address_id` int(11) DEFAULT NULL,
  `is_current` tinyint(1) DEFAULT 1,
  `changed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  
  -- Partition by entity_type for better data distribution
  `partition_key` TINYINT GENERATED ALWAYS AS (
    CASE entity_type
      WHEN 'customer' THEN 0
      WHEN 'guardian' THEN 1
      WHEN 'user' THEN 2
      WHEN 'finance' THEN 3
      ELSE 4
    END
  ) STORED,
  
  PRIMARY KEY (`id`, `partition_key`),
  KEY `idx_address_id` (`address_id`),
  KEY `idx_entity_type_id` (`entity_type`, `entity_id`),
  KEY `idx_entity_id` (`entity_id`),
  KEY `idx_is_current` (`is_current`),
  KEY `idx_changed_at` (`changed_at`),
  KEY `idx_entity_type_current` (`entity_type`, `is_current`),
  KEY `idx_entity_address` (`entity_type`, `entity_id`, `address_id`),
  
  CONSTRAINT `address_history_ibfk_1` FOREIGN KEY (`address_id`) REFERENCES `addresses` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
PARTITION BY HASH(partition_key)
PARTITIONS 5;
DROP TABLE IF EXISTS `addresses`;


DROP TABLE IF EXISTS `contacts`;
CREATE TABLE `contacts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `customer_hplno` int(50) DEFAULT NULL,
  `contact_type` enum('customer','guardian') DEFAULT NULL,
  `type` enum('mobile','landline','work') DEFAULT NULL,
  `number` varchar(20) DEFAULT NULL,
  `Finance_id` int(11) DEFAULT NULL,
  
  -- Hash partition by customer_hplno with consideration for contact_type
  `partition_key` TINYINT GENERATED ALWAYS AS (COALESCE(customer_hplno, 0) % 10) STORED,
  
  PRIMARY KEY (`id`, `partition_key`),
  
  KEY `idx_customer_hplno` (`customer_hplno`),
  KEY `idx_contact_type` (`contact_type`),
  KEY `idx_type` (`type`),
  KEY `idx_number` (`number`),
  KEY `idx_finance_id` (`Finance_id`),
  KEY `idx_customer_type` (`customer_hplno`, `contact_type`),
  KEY `idx_type_number` (`type`, `number`),
  KEY `idx_contact_type_hplno` (`contact_type`, `customer_hplno`),
  KEY `idx_hplno_finance_type` (`customer_hplno`, `Finance_id`, `contact_type`),
  
  -- Fulltext index for number search (partial)
  KEY `idx_number_prefix` (`number`(10)),
  
  CONSTRAINT `fk_contacts_customer` FOREIGN KEY (`customer_hplno`) REFERENCES `customers` (`hplno`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
PARTITION BY HASH(partition_key)
PARTITIONS 10;

DROP TABLE IF EXISTS `history_entries`;
CREATE TABLE `history_entries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `finance_id` int(11) NOT NULL,
  `customer_hplno` int(11) NOT NULL,
  `entry_type` enum('call','rc_book') NOT NULL,
  `message` text NOT NULL,
  `entry_date` date NOT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  
  -- Composite partition key combining both finance_id and customer_hplno
  `partition_key` TINYINT GENERATED ALWAYS AS (
    (COALESCE(finance_id, 0) + COALESCE(customer_hplno, 0)) % 8
  ) STORED,
  
  PRIMARY KEY (`id`, `partition_key`),
  
  KEY `idx_finance_id` (`finance_id`),
  KEY `idx_customer_hplno` (`customer_hplno`),
  KEY `idx_entry_type` (`entry_type`),
  KEY `idx_entry_date` (`entry_date`),
  KEY `idx_created_by` (`created_by`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_customer_date` (`customer_hplno`, `entry_date`),
  KEY `idx_finance_date` (`finance_id`, `entry_date`),
  KEY `idx_customer_type` (`customer_hplno`, `entry_type`),
  KEY `idx_finance_type` (`finance_id`, `entry_type`),
  KEY `idx_composite` (`customer_hplno`, `finance_id`, `entry_date`),
  
  -- Fulltext for message search
  FULLTEXT KEY `idx_ft_message` (`message`),
  
  CONSTRAINT `history_entries_ibfk_1` FOREIGN KEY (`customer_hplno`) REFERENCES `customers` (`hplno`) ON DELETE CASCADE,
  CONSTRAINT `history_entries_ibfk_2` FOREIGN KEY (`finance_id`) REFERENCES `finnance_detail` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
PARTITION BY HASH(partition_key)
PARTITIONS 8;

DROP TABLE IF EXISTS `loans`;
-- Loans table with customer-based partitioning
CREATE TABLE `loans` (
  `finance_id` int(11) DEFAULT NULL,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `customer_hplno` int(11) DEFAULT NULL,
  `loan_type` varchar(50) NOT NULL,
  `hpAmount` decimal(10,2) DEFAULT NULL,
  `hpDate` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `dueMonth` int(11) DEFAULT NULL,
  `interestRate` decimal(5,2) DEFAULT NULL,
  `penaltyAmount` decimal(10,2) DEFAULT NULL,
  `principle_part` decimal(10,2) DEFAULT NULL,
  `interest_part` decimal(10,2) DEFAULT NULL,
  `dueAmount` decimal(10,2) DEFAULT NULL,
  `down_payment` decimal(10,2) DEFAULT NULL,
  `pay_mode` enum('cash','online','bank','upi','cheque','other') DEFAULT NULL,
  `net_payment` decimal(10,2) DEFAULT NULL,
  `net_payable` decimal(10,2) DEFAULT NULL,
  `pay_mode_1` enum('cash','online','bank','upi','cheque','other') DEFAULT NULL,
  `pay_mode_1_amount` decimal(10,2) DEFAULT NULL,
  `hand_loan` decimal(10,2) DEFAULT NULL,
  `hand_loan_remarks` text DEFAULT NULL,
  `broker_name` varchar(100) DEFAULT NULL,
  `dealer_name` varchar(100) DEFAULT NULL,
  `documentation_charge` decimal(10,2) DEFAULT NULL,
  `broker_commission` decimal(10,2) DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  
  `partition_key` TINYINT GENERATED ALWAYS AS (customer_hplno % 8) STORED,
  
  PRIMARY KEY (`id`, `partition_key`),
  KEY `customer_hplno` (`customer_hplno`),
  KEY `idx_loan_type` (`loan_type`),
  KEY `idx_hp_date` (`hpDate`),
  KEY `idx_due_date` (`due_date`),
  KEY `idx_finance_id` (`finance_id`),
  KEY `idx_hp_amount` (`hpAmount`),
  KEY `idx_due_amount` (`dueAmount`),
  KEY `idx_broker_name` (`broker_name`),
  KEY `idx_dealer_name` (`dealer_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
PARTITION BY HASH(partition_key)
PARTITIONS 8;


DROP TABLE IF EXISTS `payments`;
CREATE TABLE `payments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `finance_id` INT DEFAULT NULL,
  `customer_hplno` INT DEFAULT NULL,

  `dueDate` VARCHAR(20) DEFAULT NULL,
  `paymentDate` DATE DEFAULT NULL,
  `billNumber` VARCHAR(50) DEFAULT NULL,

  `amount` DECIMAL(10,2) DEFAULT NULL,
  `penalty` DECIMAL(10,2) DEFAULT NULL,

  `collected_by` VARCHAR(100) DEFAULT NULL,

  `hand_loan` DECIMAL(10,2) DEFAULT NULL,
  `hand_loan_remark` TEXT DEFAULT NULL,

  `payment_mode` ENUM('cash','online','bank','upi','cheque','other') DEFAULT NULL,
  `payment_mode_1` ENUM('cash','online','bank','upi','cheque','other') DEFAULT NULL,
  `payment_mode_1_amount` DECIMAL(10,2) DEFAULT NULL,

  `remarks` TEXT DEFAULT NULL,

  `edited_by` VARCHAR(100) DEFAULT NULL,
  `edited_at` TIMESTAMP NULL DEFAULT NULL,

  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  KEY `idx_finance_id` (`finance_id`),
  KEY `idx_customer_hplno` (`customer_hplno`),
  KEY `idx_payment_date` (`paymentDate`),
  KEY `idx_collected_by` (`collected_by`),
  KEY `idx_bill_number` (`billNumber`),
  KEY `idx_amount` (`amount`),
  KEY `idx_payment_mode` (`payment_mode`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_due_date` (`dueDate`)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci
--
PARTITION BY RANGE (YEAR(paymentDate))
SUBPARTITION BY HASH(customer_hplno)
SUBPARTITIONS 4 (
    PARTITION p2023 VALUES LESS THAN (2024),
    PARTITION p2024 VALUES LESS THAN (2025),
    PARTITION p2025 VALUES LESS THAN (2026),
    PARTITION p2026 VALUES LESS THAN (2027),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);


CREATE TABLE `vehicle_info` (
  id INT NOT NULL,
  brand VARCHAR(100) NOT NULL,
  model_name VARCHAR(255) NOT NULL,
  make_year YEAR(4) NOT NULL,
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  /* 🔥 AUTO PARTITION KEY */
  partition_key VARCHAR(20)
    GENERATED ALWAYS AS (
      CASE
        WHEN brand IN ('Bajaj','TVS','Hero Motocorp','Honda','Suzuki')
          THEN 'bike_major'
        WHEN brand IN ('Royal Enfield','KTM','BMW Motorrad','Kawasaki','Yamaha')
          THEN 'bike_premium'
        WHEN brand IN ('Ola','Ather','Revolt','Ultraviolette','Simple Energy')
          THEN 'bike_ev'
        WHEN brand IN ('Maruti Suzuki','Hyundai','Tata','Mahindra','Toyota','Kia',
    'Honda Cars','Volkswagen','Skoda','Renault','MG Motor',
    'BMW','Mercedes-Benz','Audi','Jaguar','Land Rover')
          THEN 'car'
        ELSE 'others'
      END
    ) STORED,

  PRIMARY KEY (id, partition_key)
)
PARTITION BY LIST COLUMNS (partition_key) (
  PARTITION p_bike_major   VALUES IN ('bike_major'),
  PARTITION p_bike_premium VALUES IN ('bike_premium'),
  PARTITION p_bike_ev      VALUES IN ('bike_ev'),
  PARTITION p_car          VALUES IN ('car'),
  PARTITION p_others       VALUES IN ('others')
) ENGINE=InnoDB AUTO_INCREMENT=368 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `vehicle_detail`;
CREATE TABLE `vehicle_detail` (
  `finance_id` int(11) DEFAULT NULL,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `vehicle_info_id` int(11) DEFAULT NULL,
  `vehicle_number` varchar(100) NOT NULL,
  `vehicle_modal` varchar(10) DEFAULT NULL,
  `chassis_number` varchar(255) DEFAULT NULL,
  `engine_number` varchar(255) DEFAULT NULL,
  `num_owner` int(11) DEFAULT 1,
  `trip_driven` int(11) DEFAULT 0,
  `color` varchar(100) NOT NULL,
  `variant` varchar(100) DEFAULT NULL,
  `selling_price` decimal(12,2) DEFAULT NULL,
  `emi_from` decimal(10,2) DEFAULT NULL,
  `base_price` decimal(12,2) NOT NULL,
  `final_price` decimal(12,2) NOT NULL,
  `status` enum('available','hosted','sales','seized','sold') DEFAULT 'available',
  `created_date` date DEFAULT NULL,
  `selling_date` date DEFAULT NULL,
  `hosting_info` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`hosting_info`)),
  `monthly_income_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`monthly_income_data`)),
  `deal_type` enum('finance','consulting') NOT NULL,
  `rc_holder` enum('Company','customer','third_party','pending') DEFAULT 'Company',
  `rc_status` enum('original','duplicate','not_available') DEFAULT 'original',
  `fc_expiry_date` date DEFAULT NULL,
  `insurance_expiry_date` date DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  
  /* 🔥 Partition by Indian region based on vehicle number first two letters */
  `partition_region` VARCHAR(10) GENERATED ALWAYS AS (
    CASE 
      WHEN LEFT(vehicle_number, 2) IN ('DL', 'HR', 'PB', 'CH', 'HP', 'JK', 'UK') THEN 'north'
      WHEN LEFT(vehicle_number, 2) IN ('MH', 'GJ', 'RJ', 'MP', 'GA') THEN 'west'
      WHEN LEFT(vehicle_number, 2) IN ('TN', 'AP', 'TS', 'KA', 'KL') THEN 'south'
      WHEN LEFT(vehicle_number, 2) IN ('WB', 'BR', 'JH', 'OR', 'AS', 'MN', 'NL', 'AR', 'SK') THEN 'east'
      ELSE 'other'
    END
  ) STORED,
  
  PRIMARY KEY (`id`, `partition_region`),
  UNIQUE KEY `vehicle_number` (`vehicle_number`, `partition_region`),
  UNIQUE KEY `chassis_number` (`chassis_number`),
  UNIQUE KEY `engine_number` (`engine_number`),
  KEY `finance_id` (`finance_id`),
  KEY `vehicle_info_id` (`vehicle_info_id`),
  KEY `idx_status` (`status`),
  KEY `idx_vehicle_number_prefix` (LEFT(`vehicle_number`, 2)),
  KEY `idx_created_date` (`created_date`),
  KEY `idx_selling_date` (`selling_date`),
  KEY `idx_rc_holder` (`rc_holder`),
  KEY `idx_deal_type` (`deal_type`),
  KEY `idx_region` (`partition_region`),
  KEY `idx_final_price` (`final_price`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `vehicle_detail_ibfk_1` FOREIGN KEY (`finance_id`) REFERENCES `finnance_detail` (`id`),
  CONSTRAINT `vehicle_detail_ibfk_3` FOREIGN KEY (`vehicle_info_id`) REFERENCES `vehicle_info` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
PARTITION BY LIST COLUMNS (partition_region) (
  PARTITION p_north VALUES IN ('north'),
  PARTITION p_south VALUES IN ('south'),
  PARTITION p_east VALUES IN ('east'),
  PARTITION p_west VALUES IN ('west'),
  PARTITION p_other VALUES IN ('other')
);

DROP TABLE IF EXISTS `vehicle_expenses`;
CREATE TABLE `vehicle_expenses` (
  `finance_id` int(11) DEFAULT NULL,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `vehicle_id` int(11) DEFAULT NULL,
  `expense_date` date DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  
  -- Hash partition by vehicle_id (8 partitions)
  `partition_key` TINYINT GENERATED ALWAYS AS (COALESCE(vehicle_id, 0) % 8) STORED,
  
  PRIMARY KEY (`id`, `partition_key`),
  
  KEY `idx_vehicle_id` (`vehicle_id`),
  KEY `idx_finance_id` (`finance_id`),
  KEY `idx_expense_date` (`expense_date`),
  KEY `idx_amount` (`amount`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_vehicle_date` (`vehicle_id`, `expense_date`),
  KEY `idx_finance_date` (`finance_id`, `expense_date`),
  KEY `idx_vehicle_amount` (`vehicle_id`, `amount`),
  KEY `idx_date_amount` (`expense_date`, `amount`),
  
  -- Fulltext for description search
  FULLTEXT KEY `idx_ft_description` (`description`),
  
  CONSTRAINT `vehicle_expenses_ibfk_1` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicle_detail` (`id`) ON DELETE CASCADE,
  CONSTRAINT `vehicle_expenses_ibfk_2` FOREIGN KEY (`finance_id`) REFERENCES `finnance_detail` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
PARTITION BY HASH(partition_key)
PARTITIONS 8;

DROP TABLE IF EXISTS `vehicle_images`;
CREATE TABLE `vehicle_images` (
  `finance_id` int(11) DEFAULT NULL,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `vehicle_id` int(11) NOT NULL,
  `image_url` varchar(500) NOT NULL,
  `image_type` enum('front','side','back','interior','additional') NOT NULL,
  `is_primary` tinyint(1) DEFAULT 0,
  `file_size` int(11) DEFAULT NULL,
  `upload_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  
  -- Hash partition by vehicle_id
  `partition_key` TINYINT GENERATED ALWAYS AS (vehicle_id % 8) STORED,
  
  PRIMARY KEY (`id`, `partition_key`),
  
  KEY `idx_vehicle_id` (`vehicle_id`),
  KEY `idx_finance_id` (`finance_id`),
  KEY `idx_image_type` (`image_type`),
  KEY `idx_is_primary` (`is_primary`),
  KEY `idx_upload_date` (`upload_date`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_vehicle_type` (`vehicle_id`, `image_type`),
  KEY `idx_vehicle_primary` (`vehicle_id`, `is_primary`),
  KEY `idx_finance_vehicle` (`finance_id`, `vehicle_id`),
  KEY `idx_vehicle_upload` (`vehicle_id`, `upload_date`),
  KEY `idx_file_size` (`file_size`),
  
  CONSTRAINT `vehicle_images_ibfk_1` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicle_detail` (`id`) ON DELETE CASCADE,
  CONSTRAINT `vehicle_images_ibfk_2` FOREIGN KEY (`finance_id`) REFERENCES `finnance_detail` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
PARTITION BY HASH(partition_key)
PARTITIONS 8;



DROP TABLE IF EXISTS `recent_activity`;

CREATE TABLE `recent_activity` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `finance_id` INT(11) NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `reference_id` VARCHAR(100) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `amount` DECIMAL(12,2) DEFAULT NULL,
  `created_by` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),

  -- Primary key must include partition column
  PRIMARY KEY (`id`, `finance_id`),

  KEY `idx_finance_id` (`finance_id`),
  KEY `idx_type` (`type`),
  KEY `idx_reference_id` (`reference_id`),
  KEY `idx_amount` (`amount`),
  KEY `idx_created_by` (`created_by`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_finance_type` (`finance_id`, `type`),
  KEY `idx_finance_date` (`finance_id`, `created_at`),
  KEY `idx_type_date` (`type`, `created_at`),
  KEY `idx_reference_type` (`reference_id`, `type`),

  FULLTEXT KEY `idx_ft_description` (`description`),

  CONSTRAINT `recent_activity_ibfk_1`
    FOREIGN KEY (`finance_id`)
    REFERENCES `finnance_detail` (`id`)
    ON DELETE CASCADE
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci
PARTITION BY HASH(`finance_id`)
PARTITIONS 8;

/*!40000 ALTER TABLE `address_history` DISABLE KEYS */;
INSERT INTO `address_history` VALUES (1,'finance','1',1,1,'2025-12-07 19:22:06');
/*!40000 ALTER TABLE `address_history` ENABLE KEYS */;
/*!40000 ALTER TABLE `addresses` DISABLE KEYS */;
INSERT INTO `addresses` VALUES (1,'1','Kongu Main Road','Kongu Nagar','Kongu Nagar','Near Velan Theater','1, Kongu Main Road, Kongu Nagar','Tiruppur','Tiruppur','Tamil Nadu','641602','Kongu Nagar, Tiruppur','2025-12-07 18:39:09'),(2,'4','PN Road','Palladam Road','Veerapandi','Near Sakthi Hospital','4, PN Road, Veerapandi','Tiruppur','Tiruppur','Tamil Nadu','641605','Veerapandi, Tiruppur','2025-12-07 18:39:09'),(3,'522','Mudukankadu Road','Mudukankadu','Mudukankadu','Opp. Bus Stop','522, Mudukankadu Road','Tiruppur','Tiruppur','Tamil Nadu','641652','Mudukankadu, Tiruppur','2025-12-07 18:39:09'),(4,'555','Mangalam Road','Mangalam','Mangalam','Near Govt School','555, Mangalam Road','Tiruppur','Tiruppur','Tamil Nadu','641663','Mangalam, Tiruppur','2025-12-07 18:39:09'),(5,'608','Dharapuram Road','Dharapuram Main Road','Kallakinaru','Near Temple','608, Dharapuram Road, Kallakinaru','Tiruppur','Tiruppur','Tamil Nadu','641608','Kallakinaru, Tiruppur','2025-12-07 18:39:09'),(6,'617','Avinashi Road','Avinashi Road','Perumanallur','Near Bus Stand','617, Avinashi Road, Perumanallur','Tiruppur','Tiruppur','Tamil Nadu','641666','Perumanallur, Tiruppur','2025-12-07 18:39:09'),(7,'8','Rayapuram Street','Rayapuram','Rayapuram','Near Market','8, Rayapuram Street','Tiruppur','Tiruppur','Tamil Nadu','641601','Rayapuram, Tiruppur','2025-12-07 18:39:09'),(8,'9','Karaipudur Road','Karaipudur','Karaipudur','Near Water Tank','9, Karaipudur Road','Tiruppur','Tiruppur','Tamil Nadu','641608','Karaipudur, Tiruppur','2025-12-07 18:39:09'),(9,'6','Pushpa Theatre Road','Pushpa Nagar','Pushpa Nagar','Near Pushpa Theater','6, Pushpa Theatre Road','Tiruppur','Tiruppur','Tamil Nadu','641602','Pushpa Nagar, Tiruppur','2025-12-07 18:39:09'),(10,'199','Nallur Main Road','Nallur','Nallur','Near EB Office','199, Nallur Main Road','Tiruppur','Tiruppur','Tamil Nadu','641606','Nallur, Tiruppur','2025-12-07 19:40:42'),(11,'212','Karuvampalayam Road','Karuvampalayam','Karuvampalayam','Near Bridge','212, Karuvampalayam Road','Tiruppur','Tiruppur','Tamil Nadu','641601','Karuvampalayam, Tiruppur','2025-12-07 19:40:42'),(12,'225','Rayapuram Link Road','Rayapuram','Rayapuram','Near Old Market','225, Rayapuram Link Road','Tiruppur','Tiruppur','Tamil Nadu','641601','Rayapuram, Tiruppur','2025-12-07 19:40:42'),(13,'246','Muthanampalayam Road','Muthanampalayam','Muthanampalayam','Near Temple','246, Muthanampalayam Road','Tiruppur','Tiruppur','Tamil Nadu','641606','Muthanampalayam, Tiruppur','2025-12-07 19:40:42'),(14,'264','Poondi Road','Poondi','Poondi','Opp. Bus Stop','264, Poondi Road','Tiruppur','Tiruppur','Tamil Nadu','641652','Poondi, Tiruppur','2025-12-07 19:40:42'),(15,'282','Karaipudur Main Road','Karaipudur','Karaipudur','Near Water Tank','282, Karaipudur Main Road','Tiruppur','Tiruppur','Tamil Nadu','641608','Karaipudur, Tiruppur','2025-12-07 19:40:42'),(16,'305','Velampalayam Road','Velampalayam','Velampalayam','Near Bus Stand','305, Velampalayam Road','Tiruppur','Tiruppur','Tamil Nadu','641652','Velampalayam, Tiruppur','2025-12-07 19:40:42'),(17,'318','Kasipalayam Road','Kasipalayam','Kasipalayam','Near Govt Office','318, Kasipalayam Road','Tiruppur','Tiruppur','Tamil Nadu','641608','Kasipalayam, Tiruppur','2025-12-07 19:40:42'),(18,'330','Pooluvapatti Road','Pooluvapatti','Pooluvapatti','Near Church','330, Pooluvapatti Road','Tiruppur','Tiruppur','Tamil Nadu','641602','Pooluvapatti, Tiruppur','2025-12-07 19:40:42'),(19,'113','6','Valliyammai Nager','Rakkiya palaiyam Pirivu','Sangra Snaks','Kangayam Rode','Tiruppur','Tiruppur','Tamil Nadu','601606',NULL,'2025-12-31 11:42:49'),(20,'11','1','Angalaman nager','Muthalipalaiyam pirivu','GT garments','Sigamani House','Tiruppur','Tiruppur','Tamil Nadu','641606',NULL,'2025-12-31 11:42:49'),(27,'45','ty','st','rf','thy','yhxf','Tiruppur','Tiruppur','Tamil Nadu','614602',NULL,'2025-12-31 12:07:24'),(28,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2025-12-31 12:07:24'),(29,NULL,NULL,NULL,NULL,NULL,NULL,'Tiruppur','Tiruppur','Tamil Nadu',NULL,NULL,'2026-01-01 19:53:08'),(30,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-01-01 19:53:08'),(31,NULL,NULL,'Nellathu palaiyam','Bommanaikan palaiyam','Boss pandi malligai kadai','Sr mani mahal rode','Tiruppur','Tiruppur','Tamil Nadu',NULL,NULL,'2026-01-01 20:03:57'),(32,NULL,NULL,'Karaipudur','arasur','kpr college','peps company back side','Karumatham, patti','Coimbatore','Tamil Nadu','641659',NULL,'2026-01-01 20:03:57'),(33,NULL,NULL,'test name','test name','test name',NULL,'Tiruppur','Tiruppur','Tamil Nadu',NULL,NULL,'2026-01-02 18:30:24'),(34,NULL,NULL,'test name guardian','test name guardian','test name guardian',NULL,'Tiruppur','Tiruppur','Tamil Nadu',NULL,NULL,'2026-01-02 18:30:24'),(35,NULL,NULL,NULL,NULL,NULL,'peruntholuvu road','tirupur','tirupur','tamilnadu','641606',NULL,'2026-01-06 19:46:36'),(36,NULL,NULL,NULL,NULL,NULL,'GT garments','Tirupur','Tirpur','Tamil nadu','641606',NULL,'2026-01-06 20:12:22'),(37,'1','2','natchipalaiam','vellimazhai','sangara','near gscl opp','Tiruppur','Tiruppur','Tamil Nadu','641606',NULL,'2026-01-07 15:22:28'),(38,'12','2','tr nager','mathurai','haspital','rode back side','Tiruppur','Tiruppur','Tamil Nadu','641606',NULL,'2026-01-07 15:22:28'),(39,'1','2','sanajy','tser','wrg','wrgetaghet','Tiruppur','Tiruppur','Tamil Nadu','641606',NULL,'2026-01-07 16:26:27'),(40,'gtey4yt','ywthy','4t5q3tg','3t5y','4yt4','wrgy454t','Tiruppur','Tiruppur','Tamil Nadu','641606',NULL,'2026-01-07 16:26:27'),(41,'1','2','Karaipudur','Rakkiya palaiyam Pirivu','frf','ufduq','Tiruppur','Tiruppur','Tamil Nadu','641606',NULL,'2026-01-07 17:32:44'),(42,'1','2','rakiugd','dyfgwk','quwdfuqe','8OWQ7DO8QE7','Tiruppur','Tiruppur','Tamil Nadu','641606',NULL,'2026-01-07 17:32:44'),(43,'1','2            ','tkc','Muthalipalaiyam pirivu','mayuri store','Pei building side rode','Tiruppur','Tiruppur','Tamil Nadu','641606',NULL,'2026-01-08 07:59:51'),(44,'1','3','tkc','Muthalipalaiyam pirivu','tgg','t72f','Tiruppur','Tiruppur','Tamil Nadu','641606',NULL,'2026-01-08 07:59:51'),(45,'12','2','dddddd','dddddddd','hvrgf3rku','lt4hlv','Tiruppur','Tiruppur','Tamil Nadu',NULL,NULL,'2026-01-14 19:17:21'),(46,'1','2','fffffffffffffff','aaaaaaaaaaaaa','bbbbbb','cccccccc','Tiruppur','Tiruppur','Tamil Nadu','641606',NULL,'2026-01-14 19:17:21');
/*!40000 ALTER TABLE `addresses` ENABLE KEYS */;

-- Insert sample data
INSERT INTO `owner` (`id`, `username`, `password`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'Sanjay_rithik', 'sanjay', 1, '2026-01-02 07:23:48', '2026-01-02 07:23:48'),
(2, 'sathish', 'sathish', 1, '2026-01-05 18:29:10', '2026-01-05 18:29:10');

INSERT INTO `finance_detail` (`id`, `owner_id`, `finance_name`, `phone_numbers`, `emails`, `finance_photo`, `since`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 'Senthur', '[8870705545,9629666048]', '[]', NULL, '2019', 1, '2025-09-14 13:45:46', '2026-01-06 13:41:51'),
(2, 1, 'thiru murugan', '[]', '[]', NULL, NULL, 1, '2025-09-17 10:19:30', '2026-01-02 07:34:48'),
(3, 1, 'ABC FINANCE', '["6380201002","6380647480"]', '["info@gamil.com"]', '/uploads/1767728796290.jpg', '2019', 1, '2026-01-06 19:46:36', '2026-01-06 19:46:36'),
(4, 1, 'SENTHIL FINANCE', '["6380647480","6380201002"]', '["info@senthilfinance.com"]', '/uploads/1767730342136.jpg', '2019', 1, '2026-01-06 20:12:22', '2026-01-06 20:12:22');

-- Insert users data
INSERT INTO `users_new` (`id`, `user_id`, `email`, `username`, `phone_no`, `password`, `user_role`, `allowed_companies`, `is_active`, `created_at`, `updated_at`) VALUES
(1,'1','vell@gmail.com','vell','7575757575','vell','owner','[1,2]',NULL,NULL,NULL,0,NULL,NULL,'2026-01-02 07:43:32','2026-01-05 17:29:22'),(2,'e2e576bd-309f-11f0-983a-505bc2d9ca94','owner@example.com','usersanjay','9876543210','sanjay','owner','[1]','09:00:00','24:00:00',NULL,0,NULL,NULL,'2026-01-02 07:53:05','2026-01-05 15:10:09'),(3,'AGE888524','sanjay@gmail.com','sanjayrithik','6380201002','$2b$10$8.gTibkTzUw1XxdVCUboruEw.5ax4v/D52C3FA349KYmpG9kq2uLq','agent','[1,2]','00:00:00','23:00:00',NULL,1,NULL,NULL,'2026-01-05 14:38:08','2026-01-05 14:38:08'),(4,'AGE305432','sanjayrithik@gmail.com','sanjay','6380647480','$2b$10$eI.3XkbFO7S5tYV8fH4Pl.TgxQiMlbSrds8lUXZf9.ARDRbagiNzO','agent','[1,2]',NULL,NULL,NULL,0,NULL,NULL,'2026-01-05 15:01:45','2026-01-05 15:25:43'),(5,'OWN693132','sathish@gmail.com','sathish','8870705545','$2b$10$GO/7dFSnTQr8SEBdPTVMsujF.FxsMwf2bIT0.SGG/D6uXh5U9EP1u','owner','[1,2]',NULL,NULL,'2026-01-25 11:22:30',1,NULL,NULL,'2026-01-05 15:24:53','2026-01-25 05:52:30'),(6,'OWN578436','pratheep@gmail.com','pratheep','4455661122','$2b$10$CVU2T5jvksQnRwb4AABsdu3Yme4gH6CkNhNQxPUG8ORgXjvtC0N7m','owner','[3,4,1,2]',NULL,NULL,'2026-01-07 03:45:30',1,NULL,NULL,'2026-01-06 21:56:18','2026-01-06 22:15:30'),(7,'OWN137637','sathish1@gmail.com','sathish1','6363636363','$2b$10$/aSPNNfSCEPCbpnwMYLj6uorYZP.w8ttZCNhCryGnLVuvzBda/I/K','owner','[3,4,1,2]',NULL,NULL,'2026-01-23 06:32:31',1,NULL,NULL,'2026-01-23 01:02:18','2026-01-23 01:02:31');
INSERT INTO `users_details` (`id`, `finance_id`, `staff_name`, `staff_code`, `father_spouse_name`, `experience_years`, `education_qualification`, `joining_date`, `created_at`) VALUES
('AGE305432',1,'sannjay','11','senthil',1,'ai & ds',NULL,'2026-01-01','2026-01-05 15:01:45'),('fbba6037-e0ff-11f0-9750-505bc2d9ca94',1,'vell','1','murugan',1,'b.com',NULL,'2025-12-04','2026-01-02 07:41:34');
