-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 11, 2025 at 06:49 AM
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
(54, 3, '2025-11-11 13:17:14.034311', 'Sales_Data_2022.csv', 816600, 'Completed'),
(55, 3, '2025-11-11 13:21:18.715884', 'Sales_Data_2023.csv', 876953, 'Completed'),
(56, 4, '2025-11-11 13:34:17.607548', 'Sales_Data_2024.csv', 877007, 'Completed');

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
(4, 'Laurence', 'Flavier', 'dumpblj@gmail.com', '$2b$10$D5z5gKunguWG32xB82VT.uxGnYPR4ni7s.g5E..OoYqnZBG7pifnq', NULL, NULL, '2025-10-26 15:27:47');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `salesdata`
--
ALTER TABLE `salesdata`
  ADD PRIMARY KEY (`salesID`);

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
-- AUTO_INCREMENT for table `salesdata`
--
ALTER TABLE `salesdata`
  MODIFY `salesID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=57;

--
-- AUTO_INCREMENT for table `user`
--
ALTER TABLE `user`
  MODIFY `userId` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `salesdata`
--
ALTER TABLE `salesdata`
  ADD CONSTRAINT `userId` FOREIGN KEY (`userId`) REFERENCES `user` (`userId`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
