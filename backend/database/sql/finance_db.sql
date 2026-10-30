CREATE DATABASE  IF NOT EXISTS `RimiFinanceDesktopDB` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `RimiFinanceDesktopDB`;

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

CREATE TABLE `addresses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `house_no` varchar(50) DEFAULT NULL,
  `street` varchar(100) DEFAULT NULL,
  `street_name` varchar(100) DEFAULT NULL,
  `village` varchar(100) DEFAULT NULL,
  `land_mark` varchar(100) DEFAULT NULL,
  `address` varchar(225) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `district` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `pincode` varchar(10) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  
  `partition_state` VARCHAR(50) GENERATED ALWAYS AS (UPPER(state)) STORED,
  
  PRIMARY KEY (`id`, `partition_state`),
  KEY `idx_state` (`state`),
  KEY `idx_district` (`district`),
  KEY `idx_city` (`city`),
  KEY `idx_pincode` (`pincode`),
  KEY `idx_village` (`village`),
  KEY `idx_state_city` (`state`, `city`),
  KEY `idx_created_at` (`created_at`),
  FULLTEXT KEY `idx_ft_address` (`address`),
  FULLTEXT KEY `idx_ft_city_district` (`city`, `district`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
PARTITION BY KEY(partition_state)
PARTITIONS 8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `contacts`
--

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

--
-- Table structure for table `customers`
--

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

LOCK TABLES `finnance_detail` WRITE;
/*!40000 ALTER TABLE `finnance_detail` DISABLE KEYS */;
INSERT INTO `finnance_detail` VALUES (1,1,'Senthur','[8870705545,9629666048]','[]',NULL,'2019',1,'2025-09-14 13:45:46','2026-01-06 13:41:51'),(2,1,'thiru murugan','[]','[]',NULL,NULL,1,'2025-09-17 10:19:30','2026-01-02 07:34:48'),(3,1,'ABC FINANCE','[\"6380201002\",\"6380647480\"]','[\"info@gamil.com\"]','/uploads/1767728796290.jpg','2019',1,'2026-01-06 19:46:36','2026-01-06 19:46:36'),(4,1,'SENTHIL FINANCE','[\"6380647480\",\"6380201002\"]','[\"info@senthilfinance.com\"]','/uploads/1767730342136.jpg','2019',1,'2026-01-06 20:12:22','2026-01-06 20:12:22');
/*!40000 ALTER TABLE `finnance_detail` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `guardians`;
CREATE TABLE `guardians` (
  `finance_id` int(11) DEFAULT NULL,
  `id` int(11) NOT NULL AUTO_INCREMENT,
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
  
  -- Hash partition by customer_hplno
  `partition_key` TINYINT GENERATED ALWAYS AS (customer_hplno % 8) STORED,
  
  PRIMARY KEY (`id`, `partition_key`),
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
  
  -- Fulltext for search
  FULLTEXT KEY `idx_ft_gname` (`gname`),
  FULLTEXT KEY `idx_ft_remarks` (`remarks`),
  
  CONSTRAINT `fk_guardians_customer` FOREIGN KEY (`customer_hplno`) REFERENCES `customers` (`hplno`) ON DELETE CASCADE,
  CONSTRAINT `fk_guardians_finance` FOREIGN KEY (`finance_id`) REFERENCES `finnance_detail` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
PARTITION BY HASH(partition_key)
PARTITIONS 8;

--
-- Table structure for table `history_entries`
--

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

--
-- Table structure for table `loans`
--

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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `owner`
--

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
  KEY `idx_is_active` (`is_active`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_reset_token` (`reset_token`),
  KEY `idx_username_active` (`username`, `is_active`),
  KEY `idx_reset_token_expiry` (`reset_token_expiry`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

LOCK TABLES `owner` WRITE;
/*!40000 ALTER TABLE `owner` DISABLE KEYS */;
INSERT INTO `owner` VALUES (1,'Sanjay_rithik','sanjay',NULL,NULL,1,'2026-01-02 07:23:48','2026-01-02 07:23:48'),(2,'sathish','sathish',NULL,NULL,1,'2026-01-05 18:29:10','2026-01-05 18:29:10');
/*!40000 ALTER TABLE `owner` ENABLE KEYS */;
UNLOCK TABLES;

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

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users_details`
--

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
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `users_details` WRITE;
/*!40000 ALTER TABLE `users_details` DISABLE KEYS */;
INSERT INTO `users_details` VALUES ('AGE305432',1,'sannjay','11','senthil',1,'ai & ds',NULL,'2026-01-01','2026-01-05 15:01:45'),('fbba6037-e0ff-11f0-9750-505bc2d9ca94',1,'vell','1','murugan',1,'b.com',NULL,'2025-12-04','2026-01-02 07:41:34');
/*!40000 ALTER TABLE `users_details` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `users_new`;
CREATE TABLE `users_new` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `username` VARCHAR(100) NOT NULL,
  `phone_no` VARCHAR(13) NOT NULL,
  `password` VARCHAR(255) NOT NULL,

  `user_role` ENUM('owner','admin','agent','staff') NOT NULL,

  `allowed_companies` LONGTEXT
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_bin
    NOT NULL
    DEFAULT (JSON_ARRAY())
    CHECK (JSON_VALID(`allowed_companies`)),

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
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci

PARTITION BY HASH (CRC32(`user_id`))
PARTITIONS 8;

LOCK TABLES `users_new` WRITE;
/*!40000 ALTER TABLE `users_new` DISABLE KEYS */;
INSERT INTO `users_new` VALUES (1,'1','vell@gmail.com','vell','7575757575','vell','owner','[1,2]',NULL,NULL,NULL,0,NULL,NULL,'2026-01-02 07:43:32','2026-01-05 17:29:22'),(2,'e2e576bd-309f-11f0-983a-505bc2d9ca94','owner@example.com','usersanjay','9876543210','sanjay','owner','[1]','09:00:00','24:00:00',NULL,0,NULL,NULL,'2026-01-02 07:53:05','2026-01-05 15:10:09'),(3,'AGE888524','sanjay@gmail.com','sanjayrithik','6380201002','$2b$10$8.gTibkTzUw1XxdVCUboruEw.5ax4v/D52C3FA349KYmpG9kq2uLq','agent','[1,2]','00:00:00','23:00:00',NULL,1,NULL,NULL,'2026-01-05 14:38:08','2026-01-05 14:38:08'),(4,'AGE305432','sanjayrithik@gmail.com','sanjay','6380647480','$2b$10$eI.3XkbFO7S5tYV8fH4Pl.TgxQiMlbSrds8lUXZf9.ARDRbagiNzO','agent','[1,2]',NULL,NULL,NULL,0,NULL,NULL,'2026-01-05 15:01:45','2026-01-05 15:25:43'),(5,'OWN693132','sathish@gmail.com','sathish','8870705545','$2b$10$GO/7dFSnTQr8SEBdPTVMsujF.FxsMwf2bIT0.SGG/D6uXh5U9EP1u','owner','[1,2]',NULL,NULL,'2026-01-25 11:22:30',1,NULL,NULL,'2026-01-05 15:24:53','2026-01-25 05:52:30'),(6,'OWN578436','pratheep@gmail.com','pratheep','4455661122','$2b$10$CVU2T5jvksQnRwb4AABsdu3Yme4gH6CkNhNQxPUG8ORgXjvtC0N7m','owner','[3,4,1,2]',NULL,NULL,'2026-01-07 03:45:30',1,NULL,NULL,'2026-01-06 21:56:18','2026-01-06 22:15:30'),(7,'OWN137637','sathish1@gmail.com','sathish1','6363636363','$2b$10$/aSPNNfSCEPCbpnwMYLj6uorYZP.w8ttZCNhCryGnLVuvzBda/I/K','owner','[3,4,1,2]',NULL,NULL,'2026-01-23 06:32:31',1,NULL,NULL,'2026-01-23 01:02:18','2026-01-23 01:02:31');
/*!40000 ALTER TABLE `users_new` ENABLE KEYS */;
UNLOCK TABLES;




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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vehicle_expenses`
--

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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vehicle_images`
--

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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vehicle_info`
--
DROP TABLE IF EXISTS `vehicle_info`;



LOCK TABLES `vehicle_info` WRITE;

INSERT INTO `vehicle_info` (`id`, `brand`, `model_name`, `make_year`, `fuel_type`, `engine_capacity`, `fuel_tank_capacity`, `max_torque`, `top_speed`, `mileage`, `transmission`, `seating_capacity`, `body_type`, `base_price`, `created_at`, `updated_at`) VALUES
(1, 'Yamaha', 'MT-15 V2', '2024', 'petrol', '155cc', '10 L', '14 Nm', '130 km/h', '45 kmpl', 'manual', 2, 'bike', 160000.00, '2025-11-30 21:30:42', '2025-11-30 21:35:14'),
(2, 'Royal Enfield', 'Classic 350', '2024', 'petrol', '349cc', '13 L', '27 Nm', '110 km/h', '35 kmpl', 'manual', 2, 'bike', 190000.00, '2025-11-30 21:30:42', '2025-11-30 21:35:20'),
(3, 'Honda', 'Activa 6G', '2024', 'petrol', '109cc', '5.3 L', '8.8 Nm', '85 km/h', '50 kmpl', 'automatic', 2, 'scooter', 82000.00, '2025-11-30 21:30:42', '2025-11-30 21:30:42'),
(4, 'Maruti Suzuki', 'Baleno', '2023', 'petrol', '1197cc', '37 L', '113 Nm', '165 km/h', '22 kmpl', 'manual', 5, 'hatchback', 650000.00, '2025-11-30 21:30:42', '2025-11-30 21:30:42'),
(5, 'Hyundai', 'Creta', '2024', 'petrol', '1497cc', '50 L', '143 Nm', '170 km/h', '17 kmpl', 'automatic', 5, 'suv', 1200000.00, '2025-11-30 21:30:42', '2025-11-30 21:30:42'),
(6, 'Tata', 'Nexon', '2024', 'petrol', '1199cc', '44 L', '170 Nm', '180 km/h', '18 kmpl', 'manual', 5, 'suv', 900000.00, '2025-11-30 21:30:42', '2025-11-30 21:30:42'),
(7, 'Yamaha', 'RD350', '1985', 'petrol', '347cc', '14L', '30 Nm', '145 kmph', '25 kmpl', 'manual', 2, 'bike', 45000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(8, 'Yamaha', 'RX100', '1985', 'petrol', '98cc', '7.5L', '10.39 Nm', '100 kmph', '35 kmpl', 'manual', 2, 'bike', 22000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(9, 'Yamaha', 'RXZ', '1989', 'petrol', '131cc', '10L', '12.8 Nm', '115 kmph', '30 kmpl', 'manual', 2, 'bike', 35000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(10, 'Yamaha', 'RX135', '1990', 'petrol', '132cc', '10L', '13.8 Nm', '110 kmph', '32 kmpl', 'manual', 2, 'bike', 40000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(11, 'Yamaha', 'Crux', '1996', 'petrol', '106cc', '10.5L', '8.1 Nm', '90 kmph', '60 kmpl', 'manual', 2, 'bike', 35000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(12, 'Yamaha', 'Enticer', '1999', 'petrol', '123cc', '13L', '9.5 Nm', '95 kmph', '55 kmpl', 'manual', 2, 'bike', 45000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(13, 'Yamaha', 'FZ16', '2008', 'petrol', '153cc', '14L', '14 Nm', '126 kmph', '45 kmpl', 'manual', 2, 'bike', 80000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(14, 'Yamaha', 'R15 Version 1.0', '2008', 'petrol', '149.8cc', '12L', '15 Nm', '136 kmph', '40 kmpl', 'manual', 2, 'bike', 115000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(15, 'Yamaha', 'Fazer', '2009', 'petrol', '153cc', '14L', '14 Nm', '124 kmph', '43 kmpl', 'manual', 2, 'bike', 85000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(16, 'Yamaha', 'SZ-R', '2009', 'petrol', '153cc', '12L', '12.8 Nm', '110 kmph', '55 kmpl', 'manual', 2, 'bike', 55000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(17, 'Yamaha', 'R15 Version 2.0', '2011', 'petrol', '149.8cc', '12L', '15 Nm', '136 kmph', '40 kmpl', 'manual', 2, 'bike', 125000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(18, 'Yamaha', 'FZ-S Version 1.0', '2012', 'petrol', '153cc', '14L', '13.6 Nm', '123 kmph', '45 kmpl', 'manual', 2, 'bike', 82000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(19, 'Yamaha', 'FZ Version 2.0', '2014', 'petrol', '149cc', '13L', '13.6 Nm', '125 kmph', '45 kmpl', 'manual', 2, 'bike', 85000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(20, 'Yamaha', 'MT-09', '2014', 'petrol', '847cc', '14L', '87.5 Nm', '225 kmph', '18 kmpl', 'manual', 2, 'bike', 950000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(21, 'Yamaha', 'R3', '2015', 'petrol', '321cc', '14L', '29.6 Nm', '180 kmph', '25 kmpl', 'manual', 2, 'bike', 350000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(22, 'Yamaha', 'FZ25', '2017', 'petrol', '249cc', '14L', '20 Nm', '136 kmph', '35 kmpl', 'manual', 2, 'bike', 135000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(23, 'Yamaha', 'R15 V3', '2018', 'petrol', '155cc', '11L', '14.7 Nm', '137 kmph', '40 kmpl', 'manual', 2, 'bike', 145000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(24, 'Yamaha', 'MT-15', '2019', 'petrol', '155cc', '10L', '14.7 Nm', '130 kmph', '45 kmpl', 'manual', 2, 'bike', 135000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(25, 'Yamaha', 'FZ-X', '2021', 'petrol', '149cc', '13L', '13.3 Nm', '115 kmph', '50 kmpl', 'manual', 2, 'bike', 120000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(26, 'Yamaha', 'R15 V4', '2021', 'petrol', '155cc', '11L', '14.2 Nm', '137 kmph', '45 kmpl', 'manual', 2, 'bike', 182000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(27, 'Yamaha', 'MT-03', '2021', 'petrol', '321cc', '14L', '29.6 Nm', '180 kmph', '25 kmpl', 'manual', 2, 'bike', 415000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(28, 'Yamaha', 'YZF-R7', '2022', 'petrol', '689cc', '13L', '67 Nm', '220 kmph', '20 kmpl', 'manual', 2, 'bike', 1050000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(29, 'Yamaha', 'Aerox 155', '2022', 'petrol', '155cc', '5.5L', '13.9 Nm', '115 kmph', '45 kmpl', 'automatic', 2, 'scooter', 145000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(30, 'Yamaha', 'Fascino 125', '2022', 'petrol', '125cc', '5.2L', '9.7 Nm', '90 kmph', '55 kmpl', 'automatic', 2, 'scooter', 78000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(31, 'Yamaha', 'RayZR 125', '2023', 'petrol', '125cc', '5.2L', '10.3 Nm', '90 kmph', '58 kmpl', 'automatic', 2, 'scooter', 85000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(32, 'Yamaha', 'R15M', '2023', 'petrol', '155cc', '11L', '14.2 Nm', '137 kmph', '45 kmpl', 'manual', 2, 'bike', 205000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(33, 'Yamaha', 'MT-07', '2023', 'petrol', '689cc', '13L', '67 Nm', '220 kmph', '20 kmpl', 'manual', 2, 'bike', 1150000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(34, 'Yamaha', 'R3 2024', '2024', 'petrol', '321cc', '14L', '29.6 Nm', '180 kmph', '26 kmpl', 'manual', 2, 'bike', 468000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(35, 'Yamaha', 'FZ-S FI Version 4.0', '2024', 'petrol', '149cc', '13L', '13.3 Nm', '115 kmph', '50 kmpl', 'manual', 2, 'bike', 125000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(36, 'Yamaha', 'FZ-S FI', '2020', 'petrol', '149cc', '13L', '13.6 Nm', '125 kmph', '45 kmpl', 'manual', 2, 'bike', 110000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(37, 'Yamaha', 'FZ FI', '2020', 'petrol', '149cc', '13L', '13.6 Nm', '125 kmph', '45 kmpl', 'manual', 2, 'bike', 108000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(38, 'Yamaha', 'Saluto RX', '2016', 'petrol', '125cc', '9.2L', '10.3 Nm', '95 kmph', '65 kmpl', 'manual', 2, 'bike', 65000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(39, 'Yamaha', 'Alpha', '2014', 'petrol', '113cc', '5.2L', '8.1 Nm', '85 kmph', '60 kmpl', 'automatic', 2, 'scooter', 55000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(40, 'Yamaha', 'Ray', '2012', 'petrol', '113cc', '4L', '8.1 Nm', '85 kmph', '55 kmpl', 'automatic', 2, 'scooter', 52000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(41, 'Yamaha', 'YZF-R1', '2020', 'petrol', '998cc', '17L', '112.4 Nm', '299 kmph', '15 kmpl', 'manual', 2, 'bike', 2050000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(42, 'Yamaha', 'MT-10', '2022', 'petrol', '998cc', '17L', '112 Nm', '260 kmph', '16 kmpl', 'manual', 2, 'bike', 1550000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(43, 'Yamaha', 'XMAX 300', '2023', 'petrol', '292cc', '13L', '29 Nm', '135 kmph', '30 kmpl', 'automatic', 2, 'scooter', 625000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(44, 'Yamaha', 'NMAX', '2021', 'petrol', '155cc', '6.6L', '13.9 Nm', '115 kmph', '45 kmpl', 'automatic', 2, 'scooter', 135000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(45, 'Yamaha', 'Burgman Street', '2020', 'petrol', '125cc', '5.5L', '10.3 Nm', '90 kmph', '50 kmpl', 'automatic', 2, 'scooter', 85000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(46, 'Yamaha', 'FZS-FI V3', '2021', 'petrol', '149cc', '13L', '13.6 Nm', '125 kmph', '48 kmpl', 'manual', 2, 'bike', 115000.00, '2025-12-08 04:20:56', '2025-12-08 04:20:56'),
(47, 'Bajaj', 'M-50', '1984', 'petrol', '50cc', '5L', '4.5 Nm', '60 kmph', '50 kmpl', 'manual', 2, 'bike', 15000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(48, 'Bajaj', 'M-80', '1985', 'petrol', '80cc', '6L', '6.2 Nm', '70 kmph', '45 kmpl', 'manual', 2, 'bike', 18000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(49, 'Bajaj', 'Sunny', '1986', 'petrol', '50cc', '4.5L', '4.2 Nm', '55 kmph', '60 kmpl', 'manual', 2, 'scooter', 16000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(50, 'Bajaj', 'KB100', '1987', 'petrol', '100cc', '10L', '8.2 Nm', '95 kmph', '40 kmpl', 'manual', 2, 'bike', 22000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(51, 'Bajaj', 'Chetak', '1988', 'petrol', '145cc', '7L', '10.5 Nm', '75 kmph', '35 kmpl', 'manual', 2, 'scooter', 25000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(52, 'Bajaj', 'Super', '1989', 'petrol', '150cc', '10L', '12 Nm', '85 kmph', '30 kmpl', 'manual', 2, 'bike', 28000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(53, 'Bajaj', 'Classic', '1990', 'petrol', '150cc', '10L', '12.5 Nm', '90 kmph', '32 kmpl', 'manual', 2, 'scooter', 30000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(54, 'Bajaj', 'Legend', '1991', 'petrol', '150cc', '10.5L', '13 Nm', '95 kmph', '33 kmpl', 'manual', 2, 'scooter', 32000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(55, 'Bajaj', 'Boxer', '1992', 'petrol', '100cc', '12L', '8.5 Nm', '90 kmph', '65 kmpl', 'manual', 2, 'bike', 27000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(56, 'Bajaj', 'Spirit', '1993', 'petrol', '100cc', '11L', '8.3 Nm', '85 kmph', '60 kmpl', 'manual', 2, 'bike', 29000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(57, 'Bajaj', '4S Champion', '1994', 'petrol', '100cc', '11.5L', '8.8 Nm', '92 kmph', '55 kmpl', 'manual', 2, 'bike', 31000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(58, 'Bajaj', 'Sunny Zip', '1995', 'petrol', '50cc', '4.2L', '4 Nm', '50 kmph', '65 kmpl', 'manual', 2, 'scooter', 22000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(59, 'Bajaj', 'Caliber', '1996', 'petrol', '112cc', '11L', '9.3 Nm', '95 kmph', '50 kmpl', 'manual', 2, 'bike', 35000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(60, 'Bajaj', 'M-80 Major', '1997', 'petrol', '80cc', '8L', '6.5 Nm', '75 kmph', '55 kmpl', 'manual', 2, 'bike', 26000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(61, 'Bajaj', 'Bravo', '1998', 'petrol', '100cc', '10.5L', '8.7 Nm', '88 kmph', '52 kmpl', 'manual', 2, 'bike', 33000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(62, 'Bajaj', 'Legend Super', '1999', 'petrol', '150cc', '11L', '13.5 Nm', '100 kmph', '35 kmpl', 'manual', 2, 'scooter', 38000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(63, 'Bajaj', 'Caliber 115', '2000', 'petrol', '115cc', '11.5L', '9.8 Nm', '100 kmph', '55 kmpl', 'manual', 2, 'bike', 40000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(64, 'Bajaj', 'Pulsar 150', '2001', 'petrol', '150cc', '15L', '12.5 Nm', '110 kmph', '45 kmpl', 'manual', 2, 'bike', 52000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(65, 'Bajaj', 'Wind 125', '2002', 'petrol', '125cc', '10L', '10.5 Nm', '95 kmph', '60 kmpl', 'manual', 2, 'bike', 38000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(66, 'Bajaj', 'Pulsar 180', '2003', 'petrol', '180cc', '15L', '15.5 Nm', '120 kmph', '40 kmpl', 'manual', 2, 'bike', 65000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(67, 'Bajaj', 'Discover 125', '2004', 'petrol', '125cc', '10L', '11 Nm', '100 kmph', '65 kmpl', 'manual', 2, 'bike', 45000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(68, 'Bajaj', 'CT 100', '2005', 'petrol', '100cc', '10.5L', '8.63 Nm', '85 kmph', '80 kmpl', 'manual', 2, 'bike', 35000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(69, 'Bajaj', 'Pulsar 220 DTS-i', '2006', 'petrol', '220cc', '15L', '19.12 Nm', '135 kmph', '35 kmpl', 'manual', 2, 'bike', 85000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(70, 'Bajaj', 'Platina', '2007', 'petrol', '100cc', '11L', '8.34 Nm', '90 kmph', '85 kmpl', 'manual', 2, 'bike', 38000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(71, 'Bajaj', 'Discover 135', '2008', 'petrol', '135cc', '10L', '11.9 Nm', '105 kmph', '65 kmpl', 'manual', 2, 'bike', 50000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(72, 'Bajaj', 'Pulsar 150 DTS-i', '2009', 'petrol', '150cc', '15L', '12.76 Nm', '115 kmph', '50 kmpl', 'manual', 2, 'bike', 68000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(73, 'Bajaj', 'Discover 100', '2010', 'petrol', '100cc', '10L', '9.2 Nm', '90 kmph', '80 kmpl', 'manual', 2, 'bike', 42000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(74, 'Bajaj', 'Pulsar 200NS', '2011', 'petrol', '200cc', '12L', '18.3 Nm', '136 kmph', '38 kmpl', 'manual', 2, 'bike', 95000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(75, 'Bajaj', 'Discover 125ST', '2012', 'petrol', '125cc', '10L', '11 Nm', '100 kmph', '65 kmpl', 'manual', 2, 'bike', 58000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(76, 'Bajaj', 'Pulsar 220F', '2013', 'petrol', '220cc', '15L', '19.12 Nm', '135 kmph', '36 kmpl', 'manual', 2, 'bike', 98000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(77, 'Bajaj', 'Discover 150F', '2014', 'petrol', '150cc', '12L', '13.4 Nm', '105 kmph', '60 kmpl', 'manual', 2, 'bike', 72000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(78, 'Bajaj', 'Pulsar RS200', '2015', 'petrol', '200cc', '13L', '18.6 Nm', '141 kmph', '35 kmpl', 'manual', 2, 'bike', 135000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(79, 'Bajaj', 'V15', '2016', 'petrol', '150cc', '13L', '13 Nm', '100 kmph', '50 kmpl', 'manual', 2, 'bike', 70000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(80, 'Bajaj', 'Dominar 400', '2017', 'petrol', '400cc', '13L', '35 Nm', '155 kmph', '26 kmpl', 'manual', 2, 'bike', 165000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(81, 'Bajaj', 'Pulsar NS160', '2018', 'petrol', '160cc', '12L', '14.6 Nm', '116 kmph', '45 kmpl', 'manual', 2, 'bike', 95000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(82, 'Bajaj', 'CT110', '2019', 'petrol', '115cc', '10.5L', '9.81 Nm', '85 kmph', '75 kmpl', 'manual', 2, 'bike', 52000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(83, 'Bajaj', 'Pulsar NS200', '2020', 'petrol', '200cc', '12L', '18.74 Nm', '136 kmph', '40 kmpl', 'manual', 2, 'bike', 130000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(84, 'Bajaj', 'Chetak Electric', '2021', 'electric', '--', '--', '16 Nm', '70 kmph', '95 km/charge', 'automatic', 2, 'scooter', 140000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(85, 'Bajaj', 'Pulsar N250', '2022', 'petrol', '250cc', '14L', '21.5 Nm', '138 kmph', '35 kmpl', 'manual', 2, 'bike', 145000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(86, 'Bajaj', 'Platina 110', '2023', 'petrol', '115cc', '11L', '9.81 Nm', '90 kmph', '80 kmpl', 'manual', 2, 'bike', 75000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(87, 'Bajaj', 'Pulsar NS400', '2024', 'petrol', '400cc', '12L', '37 Nm', '160 kmph', '28 kmpl', 'manual', 2, 'bike', 220000.00, '2025-12-08 04:25:14', '2025-12-08 04:25:14'),
(88, 'TVS', '50', '1984', 'petrol', '50cc', '4.5L', '3.5 Nm', '50 km/h', '80 kmpl', 'manual', 2, 'bike', 15000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(89, 'TVS', 'Supra', '1985', 'petrol', '100cc', '8.5L', '7.5 Nm', '85 km/h', '65 kmpl', 'manual', 2, 'bike', 22000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(90, 'TVS', 'Champ', '1987', 'petrol', '100cc', '9L', '7.8 Nm', '90 km/h', '70 kmpl', 'manual', 2, 'bike', 25000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(91, 'TVS', 'Shogun', '1989', 'petrol', '110cc', '10L', '9 Nm', '100 km/h', '60 kmpl', 'manual', 2, 'bike', 32000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(92, 'TVS', 'Suzuki Samurai', '1990', 'petrol', '100cc', '10L', '8 Nm', '95 km/h', '65 kmpl', 'manual', 2, 'bike', 35000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(93, 'TVS', 'Suzuki Shogun', '1991', 'petrol', '110cc', '11L', '9.5 Nm', '105 km/h', '55 kmpl', 'manual', 2, 'bike', 38000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(94, 'TVS', 'Scooty', '1994', 'petrol', '50cc', '4L', '4 Nm', '55 km/h', '75 kmpl', 'automatic', 2, 'scooter', 28000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(95, 'TVS', 'Max 100', '1995', 'petrol', '100cc', '10.5L', '8.2 Nm', '90 km/h', '70 kmpl', 'manual', 2, 'bike', 40000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(96, 'TVS', 'Shaolin', '1997', 'petrol', '150cc', '13L', '12.5 Nm', '115 km/h', '50 kmpl', 'manual', 2, 'bike', 52000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(97, 'TVS', 'Fiero', '1999', 'petrol', '150cc', '13.5L', '13 Nm', '120 km/h', '55 kmpl', 'manual', 2, 'bike', 55000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(98, 'TVS', 'Fiero F2', '2000', 'petrol', '150cc', '13.5L', '13.2 Nm', '122 km/h', '54 kmpl', 'manual', 2, 'bike', 58000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(99, 'TVS', 'Victor', '2001', 'petrol', '110cc', '10L', '9.2 Nm', '95 km/h', '70 kmpl', 'manual', 2, 'bike', 45000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(100, 'TVS', 'Centra', '2002', 'petrol', '100cc', '10L', '8.5 Nm', '90 km/h', '65 kmpl', 'manual', 2, 'bike', 42000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(101, 'TVS', 'Scooty Pep', '2003', 'petrol', '70cc', '5L', '5.5 Nm', '65 km/h', '70 kmpl', 'automatic', 2, 'scooter', 35000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(102, 'TVS', 'Star', '2004', 'petrol', '100cc', '10L', '8.2 Nm', '88 km/h', '68 kmpl', 'manual', 2, 'bike', 43000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(103, 'TVS', 'Apache RTR 160', '2005', 'petrol', '160cc', '16L', '13.1 Nm', '120 km/h', '45 kmpl', 'manual', 2, 'bike', 70000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(104, 'TVS', 'Flame', '2007', 'petrol', '125cc', '10.5L', '10.5 Nm', '100 km/h', '60 kmpl', 'manual', 2, 'bike', 55000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(105, 'TVS', 'Apache RTR 180', '2008', 'petrol', '180cc', '16L', '15.5 Nm', '130 km/h', '40 kmpl', 'manual', 2, 'bike', 85000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(106, 'TVS', 'Jive', '2009', 'petrol', '110cc', '10L', '9.3 Nm', '95 km/h', '65 kmpl', 'manual', 2, 'bike', 48000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(107, 'TVS', 'Wego', '2010', 'petrol', '110cc', '5L', '8.3 Nm', '85 km/h', '55 kmpl', 'automatic', 2, 'scooter', 45000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(108, 'TVS', 'Apache RTR 180 ABS', '2011', 'petrol', '180cc', '16L', '15.5 Nm', '130 km/h', '40 kmpl', 'manual', 2, 'bike', 95000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(109, 'TVS', 'Stryker', '2012', 'petrol', '125cc', '12L', '11 Nm', '100 km/h', '55 kmpl', 'manual', 2, 'bike', 60000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(110, 'TVS', 'Phoenix 125', '2013', 'petrol', '125cc', '10L', '10.5 Nm', '95 km/h', '60 kmpl', 'manual', 2, 'bike', 58000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(111, 'TVS', 'Scooty Zest', '2014', 'petrol', '110cc', '5L', '8.4 Nm', '80 km/h', '60 kmpl', 'automatic', 2, 'scooter', 50000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(112, 'TVS', 'Apache RTR 200 4V', '2015', 'petrol', '200cc', '12L', '18.1 Nm', '140 km/h', '35 kmpl', 'manual', 2, 'bike', 120000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(113, 'TVS', 'Apache RR 310', '2017', 'petrol', '313cc', '11L', '27.3 Nm', '160 km/h', '30 kmpl', 'manual', 2, 'bike', 250000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(114, 'TVS', 'NTorq 125', '2018', 'petrol', '125cc', '5.8L', '10.5 Nm', '95 km/h', '45 kmpl', 'automatic', 2, 'scooter', 75000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(115, 'TVS', 'Apache RTR 160 4V', '2019', 'petrol', '160cc', '12L', '13.9 Nm', '115 km/h', '45 kmpl', 'manual', 2, 'bike', 110000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(116, 'TVS', 'Jupiter 125', '2020', 'petrol', '125cc', '5.8L', '10.5 Nm', '90 km/h', '50 kmpl', 'automatic', 2, 'scooter', 80000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(117, 'TVS', 'Apache RTR 160 2V', '2021', 'petrol', '160cc', '12L', '13.9 Nm', '115 km/h', '45 kmpl', 'manual', 2, 'bike', 115000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(118, 'TVS', 'Raider 125', '2021', 'petrol', '125cc', '10L', '11.2 Nm', '99 km/h', '67 kmpl', 'manual', 2, 'bike', 95000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(119, 'TVS', 'Ronin', '2022', 'petrol', '225.9cc', '14L', '19.93 Nm', '120 km/h', '40 kmpl', 'manual', 2, 'bike', 185000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(120, 'TVS', 'Apache RTR 310', '2023', 'petrol', '312.2cc', '11L', '27.3 Nm', '160 km/h', '30 kmpl', 'manual', 2, 'bike', 280000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(121, 'TVS', 'iQube Electric', '2023', 'electric', '4.4 kW', 'N/A', '140 Nm', '78 km/h', '100 km/charge', 'automatic', 2, 'scooter', 145000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(122, 'TVS', 'X Electric', '2024', 'electric', '7 kW', 'N/A', '160 Nm', '105 km/h', '140 km/charge', 'automatic', 2, 'scooter', 250000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(123, 'TVS', 'Apache RTR 310 Race Edition', '2024', 'petrol', '312.2cc', '11L', '29 Nm', '165 km/h', '28 kmpl', 'manual', 2, 'bike', 320000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(124, 'TVS', 'Jupiter 125 Disc', '2024', 'petrol', '125cc', '5.8L', '10.5 Nm', '90 km/h', '50 kmpl', 'automatic', 2, 'scooter', 85000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(125, 'TVS', 'Raider 125 Drum', '2024', 'petrol', '125cc', '10L', '11.2 Nm', '99 km/h', '67 kmpl', 'manual', 2, 'bike', 98000.00, '2025-12-08 04:27:43', '2025-12-08 04:27:43'),
(126, 'Honda', 'CD100', '1984', 'petrol', '99cc', '8L', '7.5Nm@5500rpm', '90kmph', '70kmpl', 'manual', 2, 'bike', 45000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(127, 'Honda', 'Super Cub C100', '1985', 'petrol', '49cc', '4.3L', '3.8Nm@5000rpm', '70kmph', '100kmpl', 'manual', 2, 'scooter', 35000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(128, 'Honda', 'CB350', '1988', 'petrol', '347cc', '12L', '28Nm@5000rpm', '130kmph', '35kmpl', 'manual', 2, 'bike', 85000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(129, 'Honda', 'CB750', '1990', 'petrol', '747cc', '19L', '62Nm@7000rpm', '190kmph', '20kmpl', 'manual', 2, 'bike', 450000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(130, 'Honda', 'CBR900RR Fireblade', '1992', 'petrol', '893cc', '18L', '87Nm@8500rpm', '270kmph', '15kmpl', 'manual', 2, 'bike', 650000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(131, 'Honda', 'CBZ', '1999', 'petrol', '156cc', '12L', '12.8Nm@6500rpm', '120kmph', '45kmpl', 'manual', 2, 'bike', 75000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(132, 'Honda', 'CBR600F4i', '2001', 'petrol', '599cc', '18L', '65Nm@11000rpm', '250kmph', '18kmpl', 'manual', 2, 'bike', 550000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(133, 'Honda', 'Activa', '2001', 'petrol', '102cc', '5.3L', '8.3Nm@5500rpm', '85kmph', '60kmpl', 'automatic', 2, 'scooter', 50000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(134, 'Honda', 'Unicorn', '2005', 'petrol', '149.1cc', '13L', '12.8Nm@6500rpm', '115kmph', '55kmpl', 'manual', 2, 'bike', 90000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(135, 'Honda', 'CBR1000RR', '2008', 'petrol', '999cc', '17.5L', '112Nm@8500rpm', '299kmph', '15kmpl', 'manual', 2, 'bike', 1450000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(136, 'Honda', 'CBR250R', '2011', 'petrol', '249.6cc', '13L', '22.9Nm@7000rpm', '145kmph', '35kmpl', 'manual', 2, 'bike', 250000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(137, 'Honda', 'Dio', '2012', 'petrol', '109cc', '5.3L', '9Nm@5500rpm', '85kmph', '55kmpl', 'automatic', 2, 'scooter', 55000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(138, 'Honda', 'CB Shine', '2014', 'petrol', '124.7cc', '10.5L', '10.3Nm@5500rpm', '100kmph', '65kmpl', 'manual', 2, 'bike', 75000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(139, 'Honda', 'CBR650F', '2014', 'petrol', '648.72cc', '17.3L', '60Nm@8000rpm', '200kmph', '25kmpl', 'manual', 2, 'bike', 850000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(140, 'Honda', 'Africa Twin', '2016', 'petrol', '998cc', '24.2L', '98Nm@6000rpm', '200kmph', '20kmpl', 'manual', 2, 'bike', 1350000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(141, 'Honda', 'Hornet 2.0', '2019', 'petrol', '184.4cc', '12L', '16.1Nm@6500rpm', '130kmph', '45kmpl', 'manual', 2, 'bike', 140000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(142, 'Honda', 'CB300R', '2019', 'petrol', '286cc', '10L', '24.1Nm@7500rpm', '145kmph', '35kmpl', 'manual', 2, 'bike', 275000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(143, 'Honda', 'Activa 6G', '2020', 'petrol', '109.51cc', '5.3L', '9Nm@5500rpm', '85kmph', '60kmpl', 'automatic', 2, 'scooter', 75000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(144, 'Honda', 'H Ness CB350', '2020', 'petrol', '348.36cc', '15L', '30Nm@3000rpm', '140kmph', '40kmpl', 'manual', 2, 'bike', 215000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(145, 'Honda', 'CB500X', '2021', 'petrol', '471cc', '17.5L', '43Nm@6500rpm', '180kmph', '30kmpl', 'manual', 2, 'bike', 725000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(146, 'Honda', 'CBR650R', '2021', 'petrol', '648.72cc', '15.4L', '60Nm@8000rpm', '210kmph', '25kmpl', 'manual', 2, 'bike', 950000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(147, 'Honda', 'ADV350', '2022', 'petrol', '329.6cc', '11.7L', '31.5Nm@5250rpm', '135kmph', '30kmpl', 'automatic', 2, 'scooter', 350000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(148, 'Honda', 'CB200X', '2022', 'petrol', '184.4cc', '12L', '16.1Nm@6500rpm', '130kmph', '45kmpl', 'manual', 2, 'bike', 145000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(149, 'Honda', 'CRF300L', '2023', 'petrol', '286cc', '7.8L', '26.6Nm@6500rpm', '130kmph', '35kmpl', 'manual', 2, 'bike', 325000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(150, 'Honda', 'XL750 Transalp', '2023', 'petrol', '755cc', '16.9L', '75Nm@7250rpm', '200kmph', '22kmpl', 'manual', 2, 'bike', 1150000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(151, 'Honda', 'Gold Wing', '2024', 'petrol', '1833cc', '21L', '170Nm@4500rpm', '200kmph', '15kmpl', 'automatic', 2, 'bike', 3850000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(152, 'Honda', 'Aviator', '2008', 'petrol', '109cc', '5.3L', '9Nm@5500rpm', '85kmph', '55kmpl', 'automatic', 2, 'scooter', 60000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(153, 'Honda', 'CB Trigger', '2013', 'petrol', '149.1cc', '12L', '12.5Nm@6500rpm', '115kmph', '50kmpl', 'manual', 2, 'bike', 85000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(154, 'Honda', 'CBR150R', '2017', 'petrol', '149.4cc', '12L', '14.4Nm@7000rpm', '130kmph', '40kmpl', 'manual', 2, 'bike', 175000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(155, 'Honda', 'Grazia', '2017', 'petrol', '109cc', '5.3L', '9Nm@5500rpm', '85kmph', '55kmpl', 'automatic', 2, 'scooter', 70000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(156, 'Honda', 'SP125', '2019', 'petrol', '124cc', '11L', '10.9Nm@6000rpm', '100kmph', '65kmpl', 'manual', 2, 'bike', 85000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(157, 'Honda', 'Activa 125', '2021', 'petrol', '124cc', '5.3L', '10.3Nm@5000rpm', '90kmph', '50kmpl', 'automatic', 2, 'scooter', 85000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(158, 'Honda', 'Shine 100', '2023', 'petrol', '98.98cc', '9L', '8.05Nm@5000rpm', '90kmph', '70kmpl', 'manual', 2, 'bike', 65000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(159, 'Honda', 'NSR250R', '1987', 'petrol', '249cc', '14L', '32Nm@9500rpm', '180kmph', '25kmpl', 'manual', 2, 'bike', 550000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(160, 'Honda', 'VFR800', '1998', 'petrol', '781cc', '21L', '72Nm@9500rpm', '220kmph', '20kmpl', 'manual', 2, 'bike', 850000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(161, 'Honda', 'CBR600RR', '2003', 'petrol', '599cc', '18L', '66Nm@11250rpm', '260kmph', '18kmpl', 'manual', 2, 'bike', 950000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(162, 'Honda', 'CB1000R', '2008', 'petrol', '998cc', '16.2L', '100Nm@8000rpm', '240kmph', '18kmpl', 'manual', 2, 'bike', 1250000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(163, 'Honda', 'Shadow 750', '1998', 'petrol', '745cc', '14L', '61Nm@3500rpm', '160kmph', '25kmpl', 'manual', 2, 'bike', 950000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(164, 'Honda', 'Rebel 300', '2017', 'petrol', '286cc', '11.4L', '25.1Nm@4500rpm', '140kmph', '35kmpl', 'manual', 2, 'bike', 350000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(165, 'Honda', 'Rebel 500', '2020', 'petrol', '471cc', '11.4L', '43Nm@6000rpm', '160kmph', '30kmpl', 'manual', 2, 'bike', 650000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(166, 'Honda', 'Varadero 1000', '1999', 'petrol', '996cc', '25L', '93Nm@6000rpm', '200kmph', '18kmpl', 'manual', 2, 'bike', 1150000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(167, 'Honda', 'NC750X', '2014', 'petrol', '745cc', '14.1L', '68Nm@4750rpm', '180kmph', '30kmpl', 'manual', 2, 'bike', 850000.00, '2025-12-08 04:32:02', '2025-12-08 04:32:02'),
(168, 'Royal Enfield', 'Bullet 350', '1985', 'petrol', '346cc', '14L', '28 Nm', '110 kmph', '40 kmpl', 'manual', 2, 'bike', 45000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(169, 'Royal Enfield', 'Bullet 500', '1988', 'petrol', '499cc', '14L', '41 Nm', '120 kmph', '35 kmpl', 'manual', 2, 'bike', 55000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(170, 'Royal Enfield', 'Bullet 350 ES', '1992', 'petrol', '346cc', '14L', '28 Nm', '110 kmph', '38 kmpl', 'manual', 2, 'bike', 65000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(171, 'Royal Enfield', 'Bullet 500', '1995', 'petrol', '499cc', '14L', '41 Nm', '125 kmph', '32 kmpl', 'manual', 2, 'bike', 75000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(172, 'Royal Enfield', 'Bullet Electra 350', '1999', 'petrol', '346cc', '14L', '28 Nm', '110 kmph', '40 kmpl', 'manual', 2, 'bike', 85000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(173, 'Royal Enfield', 'Thunderbird 350', '2002', 'petrol', '346cc', '20L', '28 Nm', '130 kmph', '35 kmpl', 'manual', 2, 'bike', 120000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(174, 'Royal Enfield', 'Bullet 500 UCE', '2009', 'petrol', '499cc', '13.5L', '41.3 Nm', '130 kmph', '30 kmpl', 'manual', 2, 'bike', 150000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(175, 'Royal Enfield', 'Classic 350', '2009', 'petrol', '346cc', '13.5L', '28 Nm', '130 kmph', '35 kmpl', 'manual', 2, 'bike', 140000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(176, 'Royal Enfield', 'Classic 500', '2010', 'petrol', '499cc', '13.5L', '41.3 Nm', '130 kmph', '30 kmpl', 'manual', 2, 'bike', 160000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(177, 'Royal Enfield', 'Thunderbird 500', '2012', 'petrol', '499cc', '20L', '41.3 Nm', '140 kmph', '30 kmpl', 'manual', 2, 'bike', 180000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(178, 'Royal Enfield', 'Continental GT 535', '2014', 'petrol', '535cc', '13.5L', '44 Nm', '140 kmph', '28 kmpl', 'manual', 2, 'bike', 210000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(179, 'Royal Enfield', 'Himalayan', '2016', 'petrol', '411cc', '15L', '32 Nm', '130 kmph', '30 kmpl', 'manual', 2, 'bike', 175000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(180, 'Royal Enfield', 'Interceptor 650', '2018', 'petrol', '648cc', '13.7L', '52 Nm', '170 kmph', '25 kmpl', 'manual', 2, 'bike', 270000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(181, 'Royal Enfield', 'Continental GT 650', '2018', 'petrol', '648cc', '12.5L', '52 Nm', '170 kmph', '25 kmpl', 'manual', 2, 'bike', 290000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(182, 'Royal Enfield', 'Meteor 350', '2020', 'petrol', '349cc', '15L', '27 Nm', '120 kmph', '35 kmpl', 'manual', 2, 'bike', 190000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(183, 'Royal Enfield', 'Classic 350 Reborn', '2021', 'petrol', '349cc', '13L', '27 Nm', '120 kmph', '35 kmpl', 'manual', 2, 'bike', 195000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(184, 'Royal Enfield', 'Himalayan 450', '2023', 'petrol', '452cc', '17L', '40 Nm', '150 kmph', '28 kmpl', 'manual', 2, 'bike', 285000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(185, 'Royal Enfield', 'Scram 411', '2022', 'petrol', '411cc', '15L', '32 Nm', '130 kmph', '30 kmpl', 'manual', 2, 'bike', 210000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(186, 'Royal Enfield', 'Bullet 350', '2023', 'petrol', '349cc', '13L', '27 Nm', '110 kmph', '40 kmpl', 'manual', 2, 'bike', 175000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(187, 'Royal Enfield', 'Shotgun 650', '2024', 'petrol', '648cc', '13.8L', '52 Nm', '160 kmph', '25 kmpl', 'manual', 2, 'bike', 350000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(188, 'Royal Enfield', 'Super Meteor 650', '2023', 'petrol', '648cc', '15.7L', '52 Nm', '180 kmph', '23 kmpl', 'manual', 2, 'bike', 340000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(189, 'Royal Enfield', 'Himalayan 450', '2024', 'petrol', '452cc', '17L', '40 Nm', '150 kmph', '28 kmpl', 'manual', 2, 'bike', 290000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(190, 'Royal Enfield', 'Classic 350 Signals', '2023', 'petrol', '349cc', '13L', '27 Nm', '120 kmph', '35 kmpl', 'manual', 2, 'bike', 210000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(191, 'Royal Enfield', 'Bullet 350 Trials', '2017', 'petrol', '346cc', '13.5L', '28 Nm', '110 kmph', '40 kmpl', 'manual', 2, 'bike', 160000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(192, 'Royal Enfield', 'Classic 500 Chrome', '2015', 'petrol', '499cc', '13.5L', '41.3 Nm', '130 kmph', '30 kmpl', 'manual', 2, 'bike', 220000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(193, 'Royal Enfield', 'Thunderbird 350X', '2019', 'petrol', '346cc', '20L', '28 Nm', '130 kmph', '35 kmpl', 'manual', 2, 'bike', 170000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(194, 'Royal Enfield', 'Bullet 350 X', '2022', 'petrol', '349cc', '13L', '27 Nm', '110 kmph', '40 kmpl', 'manual', 2, 'bike', 180000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(195, 'Royal Enfield', 'Interceptor 650 Custom', '2021', 'petrol', '648cc', '13.7L', '52 Nm', '170 kmph', '25 kmpl', 'manual', 2, 'bike', 310000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(196, 'Royal Enfield', 'Bullet 350 Machismo', '2005', 'petrol', '346cc', '13.5L', '28 Nm', '120 kmph', '38 kmpl', 'manual', 2, 'bike', 95000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(197, 'Royal Enfield', 'Lightning 535', '2013', 'petrol', '535cc', '13.5L', '44 Nm', '140 kmph', '28 kmpl', 'manual', 2, 'bike', 200000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(198, 'Royal Enfield', 'Thunderbird 350', '2011', 'petrol', '346cc', '20L', '28 Nm', '130 kmph', '35 kmpl', 'manual', 2, 'bike', 130000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(199, 'Royal Enfield', 'Meteor 350 Fireball', '2021', 'petrol', '349cc', '15L', '27 Nm', '120 kmph', '35 kmpl', 'manual', 2, 'bike', 200000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(200, 'Royal Enfield', 'Meteor 350 Stellar', '2022', 'petrol', '349cc', '15L', '27 Nm', '120 kmph', '35 kmpl', 'manual', 2, 'bike', 205000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(201, 'Royal Enfield', 'Classic 350 Chrome', '2022', 'petrol', '349cc', '13L', '27 Nm', '120 kmph', '35 kmpl', 'manual', 2, 'bike', 220000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(202, 'Royal Enfield', 'Hunter 350', '2022', 'petrol', '349cc', '13L', '27 Nm', '120 kmph', '36 kmpl', 'manual', 2, 'bike', 165000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(203, 'Royal Enfield', 'Bullet 350 Military', '2020', 'petrol', '349cc', '13L', '27 Nm', '110 kmph', '40 kmpl', 'manual', 2, 'bike', 170000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(204, 'Royal Enfield', 'Classic 350 Stealth Black', '2023', 'petrol', '349cc', '13L', '27 Nm', '120 kmph', '35 kmpl', 'manual', 2, 'bike', 225000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(205, 'Royal Enfield', 'Interceptor 650 Twinspark', '2019', 'petrol', '648cc', '13.7L', '52 Nm', '170 kmph', '25 kmpl', 'manual', 2, 'bike', 280000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(206, 'Royal Enfield', 'Continental GT 650 Chrome', '2021', 'petrol', '648cc', '12.5L', '52 Nm', '170 kmph', '25 kmpl', 'manual', 2, 'bike', 320000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(207, 'Royal Enfield', 'Himalayan 411 Rally', '2021', 'petrol', '411cc', '15L', '32 Nm', '130 kmph', '30 kmpl', 'manual', 2, 'bike', 230000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(208, 'Royal Enfield', 'Scram 411 X', '2023', 'petrol', '411cc', '15L', '32 Nm', '130 kmph', '30 kmpl', 'manual', 2, 'bike', 215000.00, '2025-12-08 04:36:00', '2025-12-08 04:36:00'),
(209, 'Hero Motocorp', 'CD100', '1984', 'petrol', '97.2 cc', '10 L', '7.95 Nm', '90 km/h', '80 kmpl', 'manual', 2, 'bike', 25000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(210, 'Hero Motocorp', 'Sleek', '1989', 'petrol', '97.2 cc', '10 L', '8 Nm', '95 km/h', '75 kmpl', 'manual', 2, 'bike', 28000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(211, 'Hero Motocorp', 'Splendor', '1994', 'petrol', '97.2 cc', '11 L', '8.05 Nm', '90 km/h', '80 kmpl', 'manual', 2, 'bike', 35000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(212, 'Hero Motocorp', 'CD100 SS', '1991', 'petrol', '97.2 cc', '10 L', '7.95 Nm', '90 km/h', '80 kmpl', 'manual', 2, 'bike', 30000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(213, 'Hero Motocorp', 'Street', '1997', 'petrol', '97.2 cc', '10 L', '8.1 Nm', '95 km/h', '78 kmpl', 'manual', 2, 'bike', 38000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(214, 'Hero Motocorp', 'Passion', '1999', 'petrol', '97.2 cc', '10 L', '8.14 Nm', '95 km/h', '75 kmpl', 'manual', 2, 'bike', 40000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(215, 'Hero Motocorp', 'Karizma', '2003', 'petrol', '223 cc', '15 L', '18.35 Nm', '140 km/h', '45 kmpl', 'manual', 2, 'bike', 85000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(216, 'Hero Motocorp', 'CBZ', '2001', 'petrol', '156.8 cc', '13 L', '12.8 Nm', '115 km/h', '55 kmpl', 'manual', 2, 'bike', 60000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(217, 'Hero Motocorp', 'Achiever', '2006', 'petrol', '149.2 cc', '12.5 L', '12.8 Nm', '110 km/h', '65 kmpl', 'manual', 2, 'bike', 55000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(218, 'Hero Motocorp', 'Hunk', '2007', 'petrol', '149.2 cc', '12.5 L', '12.8 Nm', '115 km/h', '60 kmpl', 'manual', 2, 'bike', 65000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(219, 'Hero Motocorp', 'Glamour', '2005', 'petrol', '124.7 cc', '11 L', '10.35 Nm', '100 km/h', '70 kmpl', 'manual', 2, 'bike', 50000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(220, 'Hero Motocorp', 'Pleasure', '2006', 'petrol', '102 cc', '5.5 L', '8.1 Nm', '85 km/h', '65 kmpl', 'manual', 2, 'scooter', 40000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(221, 'Hero Motocorp', 'Impulse', '2011', 'petrol', '149.2 cc', '11 L', '13.4 Nm', '100 km/h', '50 kmpl', 'manual', 2, 'bike', 75000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(222, 'Hero Motocorp', 'Maestro', '2012', 'petrol', '110.9 cc', '5.5 L', '9.4 Nm', '85 km/h', '60 kmpl', 'manual', 2, 'scooter', 45000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(223, 'Hero Motocorp', 'Duet', '2015', 'petrol', '110.9 cc', '5.5 L', '9.4 Nm', '85 km/h', '65 kmpl', 'manual', 2, 'scooter', 50000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(224, 'Hero Motocorp', 'Xtreme Sports', '2014', 'petrol', '149.2 cc', '12.5 L', '13.4 Nm', '115 km/h', '55 kmpl', 'manual', 2, 'bike', 70000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(225, 'Hero Motocorp', 'Splendor iSmart', '2014', 'petrol', '97.2 cc', '9.5 L', '8.05 Nm', '90 km/h', '85 kmpl', 'manual', 2, 'bike', 55000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(226, 'Hero Motocorp', 'Passion Pro', '2013', 'petrol', '97.2 cc', '9.5 L', '8.05 Nm', '90 km/h', '80 kmpl', 'manual', 2, 'bike', 58000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(227, 'Hero Motocorp', 'HF Deluxe', '2015', 'petrol', '97.2 cc', '9.5 L', '8.05 Nm', '85 km/h', '82 kmpl', 'manual', 2, 'bike', 45000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(228, 'Hero Motocorp', 'Achiever 150', '2016', 'petrol', '149.2 cc', '12.5 L', '12.8 Nm', '110 km/h', '65 kmpl', 'manual', 2, 'bike', 72000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(229, 'Hero Motocorp', 'Super Splendor', '2017', 'petrol', '124.7 cc', '11 L', '10.35 Nm', '100 km/h', '75 kmpl', 'manual', 2, 'bike', 65000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(230, 'Hero Motocorp', 'XPulse 200', '2019', 'petrol', '199.6 cc', '13 L', '17.35 Nm', '120 km/h', '40 kmpl', 'manual', 2, 'bike', 110000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(231, 'Hero Motocorp', 'Destini 125', '2018', 'petrol', '124.6 cc', '5.5 L', '10.2 Nm', '90 km/h', '55 kmpl', 'cvt', 2, 'scooter', 65000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(232, 'Hero Motocorp', 'Xtreme 160R', '2020', 'petrol', '163 cc', '12 L', '14 Nm', '120 km/h', '50 kmpl', 'manual', 2, 'bike', 115000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(233, 'Hero Motocorp', 'Splendor Plus', '2020', 'petrol', '97.2 cc', '9.5 L', '8.05 Nm', '90 km/h', '85 kmpl', 'manual', 2, 'bike', 65000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(234, 'Hero Motocorp', 'Passion Pro', '2021', 'petrol', '113 cc', '10 L', '9.89 Nm', '95 km/h', '70 kmpl', 'manual', 2, 'bike', 72000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(235, 'Hero Motocorp', 'HF Deluxe', '2022', 'petrol', '97.2 cc', '9.5 L', '8.05 Nm', '85 km/h', '82 kmpl', 'manual', 2, 'bike', 55000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(236, 'Hero Motocorp', 'Glamour XTEC', '2021', 'petrol', '124.7 cc', '11 L', '10.6 Nm', '105 km/h', '60 kmpl', 'manual', 2, 'bike', 85000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(237, 'Hero Motocorp', 'Xtreme 200S', '2022', 'petrol', '199.6 cc', '13 L', '17.5 Nm', '130 km/h', '40 kmpl', 'manual', 2, 'bike', 135000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(238, 'Hero Motocorp', 'XPulse 200T', '2022', 'petrol', '199.6 cc', '13 L', '17.35 Nm', '110 km/h', '45 kmpl', 'manual', 2, 'bike', 125000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(239, 'Hero Motocorp', 'Maestro Edge 125', '2023', 'petrol', '124.6 cc', '5.5 L', '10.2 Nm', '90 km/h', '55 kmpl', 'cvt', 2, 'scooter', 80000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(240, 'Hero Motocorp', 'Pleasure+ XTEC', '2023', 'petrol', '110.9 cc', '5.5 L', '8.7 Nm', '85 km/h', '60 kmpl', 'manual', 2, 'scooter', 75000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(241, 'Hero Motocorp', 'Karizma XMR', '2023', 'petrol', '210 cc', '12.8 L', '20 Nm', '135 km/h', '35 kmpl', 'manual', 2, 'bike', 190000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(242, 'Hero Motocorp', 'Xtreme 125R', '2023', 'petrol', '124.7 cc', '10 L', '11 Nm', '105 km/h', '55 kmpl', 'manual', 2, 'bike', 95000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(243, 'Hero Motocorp', 'Destini 125 XTEC', '2024', 'petrol', '124.6 cc', '5.5 L', '10.2 Nm', '90 km/h', '55 kmpl', 'cvt', 2, 'scooter', 85000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(244, 'Hero Motocorp', 'Splendor Plus XTEC', '2024', 'petrol', '97.2 cc', '9.5 L', '8.05 Nm', '90 km/h', '85 kmpl', 'manual', 2, 'bike', 78000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(245, 'Hero Motocorp', 'Mavrick 440', '2024', 'petrol', '440 cc', '13.5 L', '36 Nm', '150 km/h', '25 kmpl', 'manual', 2, 'bike', 220000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(246, 'Hero Motocorp', 'Electric Optima LA', '2022', 'electric', '1.5 kWh', 'N/A', '54 Nm', '45 km/h', '100 km/charge', 'automatic', 2, 'scooter', 75000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(247, 'Hero Motocorp', 'Electric NYX', '2023', 'electric', '1.8 kWh', 'N/A', '58 Nm', '50 km/h', '110 km/charge', 'automatic', 2, 'scooter', 90000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(248, 'Hero Motocorp', 'Vida V1', '2022', 'electric', '3.94 kWh', 'N/A', '72 Nm', '80 km/h', '165 km/charge', 'automatic', 2, 'scooter', 110000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(249, 'Hero Motocorp', 'Splendor iSmart 110', '2019', 'petrol', '110.9 cc', '9.5 L', '9.89 Nm', '95 km/h', '75 kmpl', 'manual', 2, 'bike', 70000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(250, 'Hero Motocorp', 'Xtreme 160R 4V', '2023', 'petrol', '163 cc', '12 L', '14.7 Nm', '125 km/h', '45 kmpl', 'manual', 2, 'bike', 135000.00, '2025-12-08 04:38:58', '2025-12-08 04:38:58'),
(251, 'KTM', 'Duke 125', '2006', 'petrol', '124.7cc', '11L', '12 Nm', '110 kmph', '35 kmpl', 'manual', 2, 'bike', 165000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(252, 'KTM', 'Duke 200', '2012', 'petrol', '199.5cc', '10.5L', '19.2 Nm', '135 kmph', '30 kmpl', 'manual', 2, 'bike', 185000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(253, 'KTM', 'Duke 250', '2017', 'petrol', '248.8cc', '13.4L', '24 Nm', '145 kmph', '28 kmpl', 'manual', 2, 'bike', 225000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(254, 'KTM', 'Duke 390', '2013', 'petrol', '373.2cc', '13.4L', '37 Nm', '165 kmph', '25 kmpl', 'manual', 2, 'bike', 285000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(255, 'KTM', 'Duke 390 (Gen 2)', '2017', 'petrol', '373.2cc', '13.4L', '37 Nm', '170 kmph', '25 kmpl', 'manual', 2, 'bike', 305000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(256, 'KTM', 'Duke 390 (Gen 3)', '2021', 'petrol', '399cc', '13.5L', '39 Nm', '170 kmph', '25 kmpl', 'manual', 2, 'bike', 335000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(257, 'KTM', 'RC 125', '2015', 'petrol', '124.7cc', '10L', '12 Nm', '115 kmph', '35 kmpl', 'manual', 2, 'bike', 180000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(258, 'KTM', 'RC 200', '2014', 'petrol', '199.5cc', '10L', '19.2 Nm', '140 kmph', '30 kmpl', 'manual', 2, 'bike', 215000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(259, 'KTM', 'RC 390', '2014', 'petrol', '373.2cc', '10L', '35 Nm', '175 kmph', '25 kmpl', 'manual', 2, 'bike', 295000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(260, 'KTM', 'RC 390 (Gen 2)', '2021', 'petrol', '399cc', '9.5L', '37 Nm', '180 kmph', '25 kmpl', 'manual', 2, 'bike', 315000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(261, 'KTM', '390 Adventure', '2020', 'petrol', '399cc', '14.5L', '37 Nm', '160 kmph', '30 kmpl', 'manual', 2, 'bike', 345000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(262, 'KTM', '250 Adventure', '2021', 'petrol', '248.8cc', '14.5L', '24 Nm', '140 kmph', '32 kmpl', 'manual', 2, 'bike', 265000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(263, 'KTM', '125 Duke', '2023', 'petrol', '124.7cc', '13.5L', '12 Nm', '110 kmph', '35 kmpl', 'manual', 2, 'bike', 190000.00, '2025-12-08 04:41:27', '2025-12-19 13:48:38'),
(264, 'KTM', '200 Duke (2023)', '2023', 'petrol', '199.5cc', '13.5L', '19.3 Nm', '137 kmph', '30 kmpl', 'manual', 2, 'bike', 220000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(265, 'KTM', '250 Duke', '2021', 'petrol', '248.8cc', '13.4L', '24 Nm', '145 kmph', '28 kmpl', 'manual', 2, 'bike', 240000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(266, 'KTM', '390 Duke (2023)', '2023', 'petrol', '399cc', '13.5L', '39 Nm', '170 kmph', '25 kmpl', 'manual', 2, 'bike', 350000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(267, 'KTM', '1290 Super Duke R', '2019', 'petrol', '1301cc', '16L', '141 Nm', '270 kmph', '15 kmpl', 'manual', 2, 'bike', 1850000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(268, 'KTM', '1290 Super Duke GT', '2020', 'petrol', '1301cc', '23L', '141 Nm', '250 kmph', '18 kmpl', 'manual', 2, 'bike', 2100000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(269, 'KTM', '250 EXC', '2018', 'petrol', '249cc', '8.5L', '34 Nm', 'NA', 'NA', 'manual', 1, 'bike', 850000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(270, 'KTM', '390 Enduro', '2022', 'petrol', '399cc', '9.5L', '37 Nm', 'NA', 'NA', 'manual', 1, 'bike', 450000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(271, 'KTM', '390 Scrambler', '2022', 'petrol', '399cc', '13.5L', '37 Nm', '160 kmph', '28 kmpl', 'manual', 2, 'bike', 365000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(272, 'KTM', '625 SXC', '2005', 'petrol', '625cc', '12L', '60 Nm', '160 kmph', '20 kmpl', 'manual', 1, 'bike', 550000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(273, 'KTM', '950 Adventure', '2008', 'petrol', '942cc', '22L', '95 Nm', '200 kmph', '18 kmpl', 'manual', 2, 'bike', 1250000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(274, 'KTM', 'RC 390 GP Edition', '2016', 'petrol', '373.2cc', '10L', '35 Nm', '175 kmph', '25 kmpl', 'manual', 2, 'bike', 325000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(275, 'KTM', '390 Duke Orange Edition', '2020', 'petrol', '399cc', '13.5L', '37 Nm', '170 kmph', '25 kmpl', 'manual', 2, 'bike', 365000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(276, 'KTM', '390 Adventure X', '2023', 'petrol', '399cc', '14.5L', '37 Nm', '160 kmph', '30 kmpl', 'manual', 2, 'bike', 375000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(277, 'KTM', 'E-Duke', '2024', 'electric', 'Electric', 'NA', '110 Nm', '150 kmph', 'NA', 'automatic', 2, 'bike', 650000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(278, 'KTM', '125 Duke (2024)', '2024', 'petrol', '124.7cc', '13.5L', '12 Nm', '110 kmph', '35 kmpl', 'manual', 2, 'bike', 195000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(279, 'KTM', '200 Duke (2024)', '2024', 'petrol', '199.5cc', '13.5L', '19.3 Nm', '137 kmph', '30 kmpl', 'manual', 2, 'bike', 225000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(280, 'KTM', '250 Duke (2024)', '2024', 'petrol', '248.8cc', '13.4L', '24 Nm', '145 kmph', '28 kmpl', 'manual', 2, 'bike', 245000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(281, 'KTM', '390 Duke (2024)', '2024', 'petrol', '399cc', '13.5L', '39 Nm', '170 kmph', '25 kmpl', 'manual', 2, 'bike', 355000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(282, 'KTM', 'RC 390 (2024)', '2024', 'petrol', '399cc', '9.5L', '37 Nm', '180 kmph', '25 kmpl', 'manual', 2, 'bike', 320000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(283, 'KTM', '390 Duke Matt Black', '2023', 'petrol', '399cc', '13.5L', '39 Nm', '170 kmph', '25 kmpl', 'manual', 2, 'bike', 360000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(284, 'KTM', 'RC 200 Special Edition', '2022', 'petrol', '199.5cc', '10L', '19.2 Nm', '140 kmph', '30 kmpl', 'manual', 2, 'bike', 225000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(285, 'KTM', '1290 Super Adventure S', '2022', 'petrol', '1301cc', '23L', '141 Nm', '240 kmph', '18 kmpl', 'manual', 2, 'bike', 1950000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(286, 'KTM', '1290 Super Adventure R', '2022', 'petrol', '1301cc', '23L', '141 Nm', '220 kmph', '17 kmpl', 'manual', 2, 'bike', 2050000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(287, 'KTM', 'Duke 125 (2015)', '2015', 'petrol', '124.7cc', '11L', '12 Nm', '110 kmph', '35 kmpl', 'manual', 2, 'bike', 170000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(288, 'KTM', 'Duke 200 (2015)', '2015', 'petrol', '199.5cc', '10.5L', '19.2 Nm', '135 kmph', '30 kmpl', 'manual', 2, 'bike', 190000.00, '2025-12-08 04:41:27', '2025-12-08 04:41:27'),
(289, 'Ather Energy', '450', '2018', 'electric', '5.4 kW', NULL, '20.5 Nm', '80 kmph', '75 km/charge', 'automatic', 2, 'scooter', 124750.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(290, 'Ather Energy', '450 Plus', '2019', 'electric', '5.4 kW', NULL, '20.5 Nm', '80 kmph', '75 km/charge', 'automatic', 2, 'scooter', 119000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(291, 'Ather Energy', '450X', '2019', 'electric', '6 kW', NULL, '26 Nm', '80 kmph', '85 km/charge', 'automatic', 2, 'scooter', 128000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(292, 'Ather Energy', '450X (Gen 3)', '2020', 'electric', '6 kW', NULL, '26 Nm', '80 kmph', '85 km/charge', 'automatic', 2, 'scooter', 131000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(293, 'Ather Energy', '450 Plus (Gen 3)', '2020', 'electric', '5.4 kW', NULL, '22 Nm', '80 kmph', '75 km/charge', 'automatic', 2, 'scooter', 121000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(294, 'Ather Energy', '450X Pro Pack', '2021', 'electric', '6 kW', NULL, '26 Nm', '80 kmph', '85 km/charge', 'automatic', 2, 'scooter', 145000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(295, 'Ather Energy', '450X Plus Pack', '2021', 'electric', '6 kW', NULL, '26 Nm', '80 kmph', '85 km/charge', 'automatic', 2, 'scooter', 135000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(296, 'Ather Energy', '450X Gen 3 (2022)', '2022', 'electric', '6 kW', NULL, '26 Nm', '80 kmph', '105 km/charge', 'automatic', 2, 'scooter', 138000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(297, 'Ather Energy', '450 Plus Gen 3 (2022)', '2022', 'electric', '5.4 kW', NULL, '22 Nm', '80 kmph', '85 km/charge', 'automatic', 2, 'scooter', 126000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(298, 'Ather Energy', '450X Pro Pack 2022', '2022', 'electric', '6 kW', NULL, '26 Nm', '90 kmph', '105 km/charge', 'automatic', 2, 'scooter', 158000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(299, 'Ather Energy', '450S', '2023', 'electric', '5.4 kW', NULL, '22 Nm', '90 kmph', '115 km/charge', 'automatic', 2, 'scooter', 129999.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(300, 'Ather Energy', '450X (2023)', '2023', 'electric', '6 kW', NULL, '26 Nm', '90 kmph', '146 km/charge', 'automatic', 2, 'scooter', 158000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(301, 'Ather Energy', '450X Pro Pack 2023', '2023', 'electric', '6 kW', NULL, '26 Nm', '90 kmph', '146 km/charge', 'automatic', 2, 'scooter', 168000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(302, 'Ather Energy', '450X Apex', '2023', 'electric', '6 kW', NULL, '26 Nm', '100 kmph', '146 km/charge', 'automatic', 2, 'scooter', 199000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(303, 'Ather Energy', '450X 2024', '2024', 'electric', '6.2 kW', NULL, '28 Nm', '95 kmph', '150 km/charge', 'automatic', 2, 'scooter', 165000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(304, 'Ather Energy', 'Rizta', '2024', 'electric', '7 kW', NULL, '30 Nm', '90 kmph', '160 km/charge', 'automatic', 2, 'scooter', 145000.00, '2025-12-08 04:43:33', '2025-12-08 04:43:33'),
(305, 'Ola Electric', 'S1', '2021', 'electric', '8.5 kW Motor', NULL, '58 Nm', '90 kmph', '121 km/charge', 'automatic', 2, 'scooter', 99999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(306, 'Ola Electric', 'S1 Pro', '2021', 'electric', '8.5 kW Motor', NULL, '58 Nm', '115 kmph', '181 km/charge', 'automatic', 2, 'scooter', 139999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(307, 'Ola Electric', 'S1 Air', '2023', 'electric', '4.5 kW Motor', NULL, '40 Nm', '85 kmph', '101 km/charge', 'automatic', 2, 'scooter', 84999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(308, 'Ola Electric', 'S1 X', '2023', 'electric', '3 kW Motor', NULL, '26 Nm', '85 kmph', '89 km/charge', 'automatic', 2, 'scooter', 79999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(309, 'Ola Electric', 'S1 X+', '2023', 'electric', '3 kW Motor', NULL, '26 Nm', '85 kmph', '89 km/charge', 'automatic', 2, 'scooter', 89999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(310, 'Ola Electric', 'S1 X (4kWh)', '2024', 'electric', '6 kW Motor', NULL, '26 Nm', '95 kmph', '151 km/charge', 'automatic', 2, 'scooter', 109999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(311, 'Ola Electric', 'S1 Pro (Gen 2)', '2022', 'electric', '8.5 kW Motor', NULL, '58 Nm', '120 kmph', '195 km/charge', 'automatic', 2, 'scooter', 144999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(312, 'Ola Electric', 'S1 Pro (3kWh)', '2023', 'electric', '8.5 kW Motor', NULL, '58 Nm', '120 kmph', '190 km/charge', 'automatic', 2, 'scooter', 149999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(313, 'Ola Electric', 'S1 Pro (4kWh)', '2023', 'electric', '8.5 kW Motor', NULL, '58 Nm', '120 kmph', '240 km/charge', 'automatic', 2, 'scooter', 154999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(314, 'Ola Electric', 'S1 Pro MoveOS 3', '2023', 'electric', '8.5 kW Motor', NULL, '58 Nm', '120 kmph', '195 km/charge', 'automatic', 2, 'scooter', 149999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(315, 'Ola Electric', 'S1 X+ (Limited Edition)', '2024', 'electric', '3 kW Motor', NULL, '26 Nm', '90 kmph', '95 km/charge', 'automatic', 2, 'scooter', 92999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(316, 'Ola Electric', 'S1 Air (2kWh)', '2024', 'electric', '4.5 kW Motor', NULL, '40 Nm', '90 kmph', '125 km/charge', 'automatic', 2, 'scooter', 89999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(317, 'Ola Electric', 'S1 Air (3kWh)', '2024', 'electric', '4.5 kW Motor', NULL, '40 Nm', '90 kmph', '165 km/charge', 'automatic', 2, 'scooter', 109999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(318, 'Ola Electric', 'S1 (Gen 2)', '2022', 'electric', '8.5 kW Motor', NULL, '58 Nm', '95 kmph', '141 km/charge', 'automatic', 2, 'scooter', 109999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(319, 'Ola Electric', 'S1 X (2kWh)', '2024', 'electric', '3 kW Motor', NULL, '26 Nm', '85 kmph', '95 km/charge', 'automatic', 2, 'scooter', 69999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(320, 'Ola Electric', 'S1 X (3kWh)', '2024', 'electric', '6 kW Motor', NULL, '26 Nm', '90 kmph', '125 km/charge', 'automatic', 2, 'scooter', 84999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(321, 'Ola Electric', 'S1 Pro (MoveOS 4)', '2024', 'electric', '8.5 kW Motor', NULL, '58 Nm', '120 kmph', '220 km/charge', 'automatic', 2, 'scooter', 159999.00, '2025-12-08 04:45:33', '2025-12-08 04:45:33'),
(322, 'Suzuki', 'Maruti 800', '1984', 'petrol', '796 cc', '28 L', '59 Nm @ 3500 rpm', '120 km/h', '16 kmpl', 'manual', 4, 'hatchback', 150000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(323, 'Suzuki', 'Maruti Gypsy', '1985', 'petrol', '970 cc', '43 L', '76 Nm @ 3000 rpm', '110 km/h', '10 kmpl', 'manual', 4, 'suv', 450000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(324, 'Suzuki', 'Maruti Omni', '1985', 'petrol', '796 cc', '35 L', '59 Nm @ 3500 rpm', '110 km/h', '14 kmpl', 'manual', 8, 'muv', 200000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(325, 'Suzuki', 'Maruti 1000', '1990', 'petrol', '970 cc', '37 L', '78 Nm @ 4500 rpm', '135 km/h', '14 kmpl', 'manual', 5, 'sedan', 350000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(326, 'Suzuki', 'Maruti Zen', '1993', 'petrol', '993 cc', '35 L', '81 Nm @ 4500 rpm', '140 km/h', '16 kmpl', 'manual', 5, 'hatchback', 400000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(327, 'Suzuki', 'Maruti Esteem', '1994', 'petrol', '1298 cc', '37 L', '104 Nm @ 4500 rpm', '160 km/h', '14 kmpl', 'manual', 5, 'sedan', 550000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(328, 'Suzuki', 'Maruti Baleno', '1999', 'petrol', '1586 cc', '50 L', '138 Nm @ 4000 rpm', '180 km/h', '12 kmpl', 'manual', 5, 'sedan', 750000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(329, 'Suzuki', 'Maruti Alto', '2000', 'petrol', '796 cc', '35 L', '69 Nm @ 3500 rpm', '130 km/h', '18 kmpl', 'manual', 5, 'hatchback', 300000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(330, 'Suzuki', 'Maruti Wagon R', '2002', 'petrol', '998 cc', '35 L', '84 Nm @ 3500 rpm', '140 km/h', '17 kmpl', 'manual', 5, 'hatchback', 400000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(331, 'Suzuki', 'Maruti Swift', '2005', 'petrol', '1298 cc', '43 L', '110 Nm @ 3500 rpm', '160 km/h', '16 kmpl', 'manual', 5, 'hatchback', 600000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(332, 'Suzuki', 'Maruti SX4', '2007', 'petrol', '1586 cc', '50 L', '145 Nm @ 4000 rpm', '175 km/h', '14 kmpl', 'manual', 5, 'sedan', 850000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(333, 'Suzuki', 'Maruti A-Star', '2008', 'petrol', '998 cc', '35 L', '90 Nm @ 3500 rpm', '150 km/h', '19 kmpl', 'manual', 5, 'hatchback', 450000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(334, 'Suzuki', 'Maruti Ritz', '2009', 'petrol', '1197 cc', '35 L', '101 Nm @ 3500 rpm', '155 km/h', '17 kmpl', 'manual', 5, 'hatchback', 550000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(335, 'Suzuki', 'Maruti Ertiga', '2012', 'petrol', '1462 cc', '45 L', '138 Nm @ 4000 rpm', '165 km/h', '16 kmpl', 'manual', 7, 'muv', 850000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(336, 'Suzuki', 'Maruti Celerio', '2014', 'petrol', '998 cc', '35 L', '90 Nm @ 3500 rpm', '150 km/h', '23 kmpl', 'amt', 5, 'hatchback', 500000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(337, 'Suzuki', 'Maruti Ciaz', '2014', 'petrol', '1462 cc', '43 L', '130 Nm @ 4000 rpm', '180 km/h', '20 kmpl', 'manual', 5, 'sedan', 950000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(338, 'Suzuki', 'Maruti Baleno (New)', '2015', 'petrol', '1197 cc', '37 L', '115 Nm @ 4000 rpm', '170 km/h', '21 kmpl', 'manual', 5, 'hatchback', 700000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(339, 'Suzuki', 'Maruti Vitara Brezza', '2016', 'diesel', '1248 cc', '48 L', '200 Nm @ 1750 rpm', '170 km/h', '24 kmpl', 'manual', 5, 'suv', 950000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(340, 'Suzuki', 'Maruti Dzire', '2017', 'petrol', '1197 cc', '37 L', '113 Nm @ 4200 rpm', '165 km/h', '22 kmpl', 'manual', 5, 'sedan', 650000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(341, 'Suzuki', 'Maruti Swift (3rd Gen)', '2018', 'petrol', '1197 cc', '37 L', '113 Nm @ 4200 rpm', '170 km/h', '22 kmpl', 'manual', 5, 'hatchback', 650000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(342, 'Suzuki', 'Maruti Eeco', '2019', 'cng', '1196 cc', '90 L (CNG)', '98 Nm @ 4200 rpm', '120 km/h', '21 km/kg', 'manual', 5, 'muv', 550000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(343, 'Suzuki', 'Maruti XL6', '2019', 'petrol', '1462 cc', '45 L', '138 Nm @ 4400 rpm', '165 km/h', '19 kmpl', 'automatic', 6, 'muv', 1200000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(344, 'Suzuki', 'Maruti S-Presso', '2020', 'petrol', '998 cc', '27 L', '90 Nm @ 3500 rpm', '140 km/h', '21 kmpl', 'manual', 5, 'hatchback', 450000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(345, 'Suzuki', 'Maruti Ignis', '2020', 'petrol', '1197 cc', '32 L', '113 Nm @ 4200 rpm', '155 km/h', '20 kmpl', 'amt', 5, 'hatchback', 650000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(346, 'Suzuki', 'Maruti Jimny', '2021', 'petrol', '1462 cc', '40 L', '130 Nm @ 4000 rpm', '145 km/h', '16 kmpl', 'manual', 4, 'suv', 1500000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(347, 'Suzuki', 'Maruti Celerio (New)', '2021', 'petrol', '998 cc', '35 L', '89 Nm @ 3500 rpm', '150 km/h', '26 kmpl', 'amt', 5, 'hatchback', 600000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(348, 'Suzuki', 'Maruti Baleno (2022)', '2022', 'petrol', '1197 cc', '37 L', '113 Nm @ 4200 rpm', '170 km/h', '22 kmpl', 'automatic', 5, 'hatchback', 750000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(349, 'Suzuki', 'Maruti Brezza (2022)', '2022', 'petrol', '1462 cc', '48 L', '138 Nm @ 4400 rpm', '170 km/h', '20 kmpl', 'automatic', 5, 'suv', 1100000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(350, 'Suzuki', 'Maruti Fronx', '2023', 'petrol', '1197 cc', '37 L', '113 Nm @ 4200 rpm', '170 km/h', '22 kmpl', 'automatic', 5, 'suv', 900000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(351, 'Suzuki', 'Maruti Invicto', '2023', 'hybrid', '1987 cc', '55 L', '244 Nm @ 2800-3400 rpm', '180 km/h', '23 kmpl', 'automatic', 7, 'muv', 2800000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(352, 'Suzuki', 'Maruti Swift (2024)', '2024', 'petrol', '1197 cc', '37 L', '115 Nm @ 4300 rpm', '175 km/h', '25 kmpl', 'automatic', 5, 'hatchback', 800000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(353, 'Suzuki', 'Maruti Versa', '2001', 'petrol', '1298 cc', '40 L', '102 Nm @ 4500 rpm', '145 km/h', '12 kmpl', 'manual', 8, 'muv', 650000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(354, 'Suzuki', 'Maruti Grand Vitara', '2007', 'petrol', '1995 cc', '58 L', '184 Nm @ 4000 rpm', '180 km/h', '10 kmpl', 'manual', 5, 'suv', 1800000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(355, 'Suzuki', 'Maruti Kizashi', '2011', 'petrol', '2393 cc', '63 L', '230 Nm @ 4000 rpm', '210 km/h', '12 kmpl', 'manual', 5, 'sedan', 2200000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(356, 'Suzuki', 'Access 125', '2007', 'petrol', '124 cc', '5.6 L', '10.2 Nm @ 5000 rpm', '95 km/h', '60 kmpl', 'cvt', 2, 'scooter', 95000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(357, 'Suzuki', 'Gixxer', '2014', 'petrol', '155 cc', '12 L', '14 Nm @ 6000 rpm', '120 km/h', '45 kmpl', 'manual', 2, 'bike', 150000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(358, 'Suzuki', 'Burgman Street', '2018', 'petrol', '125 cc', '5.5 L', '10.2 Nm @ 5000 rpm', '90 km/h', '55 kmpl', 'cvt', 2, 'scooter', 110000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(359, 'Suzuki', 'V-Strom 250', '2021', 'petrol', '249 cc', '17 L', '22.2 Nm @ 7300 rpm', '140 km/h', '35 kmpl', 'manual', 2, 'bike', 250000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(360, 'Suzuki', 'Avenis', '2022', 'petrol', '124 cc', '5.2 L', '10 Nm @ 5500 rpm', '90 km/h', '58 kmpl', 'cvt', 2, 'scooter', 105000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(361, 'Suzuki', 'Maruti 800 AC', '1990', 'petrol', '796 cc', '28 L', '59 Nm @ 3500 rpm', '120 km/h', '15 kmpl', 'manual', 4, 'hatchback', 200000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(362, 'Suzuki', 'Maruti Zen Classic', '1999', 'petrol', '993 cc', '35 L', '81 Nm @ 4500 rpm', '140 km/h', '16 kmpl', 'manual', 5, 'hatchback', 500000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(363, 'Suzuki', 'Maruti Swift ZXi+', '2019', 'petrol', '1197 cc', '37 L', '113 Nm @ 4200 rpm', '170 km/h', '21 kmpl', 'automatic', 5, 'hatchback', 850000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(364, 'Suzuki', 'Maruti Swift Diesel', '2012', 'diesel', '1248 cc', '43 L', '190 Nm @ 2000 rpm', '165 km/h', '25 kmpl', 'manual', 5, 'hatchback', 800000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(365, 'Suzuki', 'Maruti Dzire Diesel', '2015', 'diesel', '1248 cc', '43 L', '190 Nm @ 2000 rpm', '165 km/h', '26 kmpl', 'manual', 5, 'sedan', 900000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(366, 'Suzuki', 'Maruti Wagon R CNG', '2015', 'cng', '998 cc', '60 L (CNG)', '82 Nm @ 3500 rpm', '130 km/h', '32 km/kg', 'manual', 5, 'hatchback', 550000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08'),
(367, 'Suzuki', 'Maruti Tour S CNG', '2021', 'cng', '1197 cc', '90 L (CNG)', '98 Nm @ 4200 rpm', '130 km/h', '26 km/kg', 'manual', 5, 'hatchback', 700000.00, '2025-12-08 04:48:08', '2025-12-08 04:48:08');

UNLOCK TABLES;
