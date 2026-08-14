CREATE TABLE `password_credentials` (
  `email` varchar(320) NOT NULL,
  `passwordHash` varchar(128) NOT NULL,
  `salt` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `password_credentials_pk` PRIMARY KEY(`email`)
);
