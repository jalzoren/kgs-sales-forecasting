-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Dec 03, 2025 at 11:46 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `kgs`
--

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `notificationId` int(11) NOT NULL,
  `userId` int(11) NOT NULL,
  `type` varchar(50) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `timestamp` datetime(6) DEFAULT current_timestamp(6),
  `isRead` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`notificationId`, `userId`, `type`, `title`, `message`, `timestamp`, `isRead`) VALUES
(4, 3, 'info', 'Info', 'Uploading sales data...', '2025-12-03 18:33:01.164214', 0),
(5, 3, 'success', 'Success', 'Sales data uploaded successfully: Sales_Data_Week_2025-11-24.csv', '2025-12-03 18:33:02.197665', 0);

-- --------------------------------------------------------

--
-- Table structure for table `salesdata`
--

CREATE TABLE `salesdata` (
  `salesID` int(11) NOT NULL,
  `userId` int(11) NOT NULL,
  `uploadDate` datetime(6) DEFAULT current_timestamp(6),
  `fileName` varchar(255) NOT NULL,
  `records` int(11) NOT NULL,
  `status` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `salesdata`
--

INSERT INTO `salesdata` (`salesID`, `userId`, `uploadDate`, `fileName`, `records`, `status`) VALUES
(170, 3, '2025-11-29 01:51:30.812126', 'Sales_Data_2022.csv', 76702, 'Completed'),
(171, 3, '2025-11-29 01:56:08.500551', 'Sales_Data_2023.csv', 74662, 'Completed'),
(172, 3, '2025-11-29 01:57:34.749325', 'Sales_Data_2024.csv', 77477, 'Completed'),
(173, 3, '2025-11-29 02:54:50.683969', 'Sales_Data_Week_2025-11-03.csv', 2542, 'Completed'),
(174, 3, '2025-11-29 06:27:36.307384', 'Sales_Data_Week_2025-11-10.csv', 2612, 'Completed'),
(175, 3, '2025-12-03 17:57:08.807920', 'Sales_Data_Week_2025-11-17.csv', 10006, 'Completed'),
(177, 3, '2025-12-03 18:33:02.132364', 'Sales_Data_Week_2025-11-24.csv', 2531, 'Completed');

-- --------------------------------------------------------

--
-- Table structure for table `user`
--

CREATE TABLE `user` (
  `userId` int(11) NOT NULL,
  `firstName` varchar(100) NOT NULL,
  `lastName` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `resetCode` varchar(11) DEFAULT NULL,
  `codeExpiry` timestamp(6) NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `user`
--

INSERT INTO `user` (`userId`, `firstName`, `lastName`, `email`, `password`, `resetCode`, `codeExpiry`, `createdAt`) VALUES
(3, 'Jerimiah', 'Bitancor', 'bitancor1234amora@gmail.com', '$2b$10$rg28hXSWc4yxkz5vUkE0pelanp24PE.6xwSY6Od0TVMaPi4Oc7FCy', NULL, NULL, '2025-10-26 13:12:40'),
(5, 'Bianca', 'Shinozuka', 'bianca.cagurungan03@gmail.com', '$2b$10$UwxxGi2Pgk7cSEEPo79n7O7Ok3haBrxRUQshKscUvH9jwkwipY3Vi', NULL, NULL, '2025-11-16 14:17:54'),
(6, 'Jerimiah', 'Bitancor', 'bitancor_jeremiah@plpasig.edu.ph', '$2b$10$URhaYZ4vO35GC7D3ubKvredIRUFB06U3z4qn/.IlvNjspUhvqqCT2', NULL, NULL, '2025-11-16 14:18:36');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`notificationId`),
  ADD KEY `fk_notification_user` (`userId`);

--
-- Indexes for table `salesdata`
--
ALTER TABLE `salesdata`
  ADD PRIMARY KEY (`salesID`),
  ADD KEY `fk_salesdata_user_id` (`userId`);

--
-- Indexes for table `user`
--
ALTER TABLE `user`
  ADD PRIMARY KEY (`userId`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `notificationId` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `salesdata`
--
ALTER TABLE `salesdata`
  MODIFY `salesID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=178;

--
-- AUTO_INCREMENT for table `user`
--
ALTER TABLE `user`
  MODIFY `userId` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_notification_user` FOREIGN KEY (`userId`) REFERENCES `user` (`userId`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `salesdata`
--
ALTER TABLE `salesdata`
  ADD CONSTRAINT `fk_salesdata_user_id` FOREIGN KEY (`userId`) REFERENCES `user` (`userId`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
