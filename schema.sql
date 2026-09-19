CREATE DATABASE university_db;

USE university_db;

CREATE TABLE students (
    rollno VARCHAR(50) PRIMARY KEY NOT NULL,
    student_name VARCHAR(150),
	dob VARCHAR(12),
    gender VARCHAR(10),
    father_name VARCHAR(150),
	religion VARCHAR(70),
    category VARCHAR(50),
	marital_status VARCHAR(50),
    department VARCHAR(100),
	year_of_admission INT,
    phone_no VARCHAR(15),
    email VARCHAR(100),
    nationality VARCHAR(100),
	domicile_state VARCHAR(150),
    district VARCHAR(150),
    pin_code INT,
    permanent_address VARCHAR(200),
    correspondence_address VARCHAR(200),
    profile_pic VARCHAR(300)
);

CREATE TABLE users (	
    username VARCHAR(50) NOT NULL PRIMARY KEY,
    password VARCHAR(255) NOT NULL,
    FOREIGN KEY (username) REFERENCES students(rollno) ON DELETE CASCADE
);

CREATE TABLE job_details (
    rollno varchar(255) NOT NULL,
    date_of_joining VARCHAR(12) NOT NULL,
    company_name varchar(255) NOT NULL,
    address_of_company text NOT NULL,
    date_of_leaving VARCHAR(12) DEFAULT NULL,
    offer_letter varchar(255) NOT NULL,
    PRIMARY KEY (rollno, company_name),
    FOREIGN KEY (rollno) REFERENCES students(rollno) ON DELETE CASCADE
);

CREATE TABLE admin_login (	
    username VARCHAR(50) NOT NULL PRIMARY KEY,
    password VARCHAR(50) NOT NULL
);

CREATE TABLE courses (
    course_code VARCHAR(25) PRIMARY KEY NOT NULL,
    course_name VARCHAR(100) NOT NULL,
    course_type VARCHAR(25) NOT NULL,
    department VARCHAR(100) NOT NULL,
    semester INT NOT NULL,
    credits DECIMAL(5, 2) NOT NULL,
    min_marks INT NOT NULL,
    max_marks INT NOT NULL
);

CREATE TABLE student_marks (
    rollno VARCHAR(50) NOT NULL,
    course_code VARCHAR(20) NOT NULL,
    session VARCHAR(15) NOT NULL,
    semester INT NOT NULL,
    marks_obtained INT NOT NULL,
    marks_internal INT,
    grade VARCHAR(4) NOT NULL,
    PRIMARY KEY (rollno, course_code),
    FOREIGN KEY (rollno) REFERENCES students(rollno) ON DELETE CASCADE,
    FOREIGN KEY (course_code) REFERENCES courses(course_code)
);

CREATE TABLE student_total_marks (
    rollno VARCHAR(50) NOT NULL,
    semester INT NOT NULL,
    session VARCHAR(15) NOT NULL,
    total_min_marks INT NOT NULL,
    total_max_marks INT NOT NULL,
    total_credits DECIMAL(5, 2) NOT NULL,
    total_marks_obtained INT NOT NULL,
    gpa DECIMAL(5, 2),
    primary key (rollno, semester),
    FOREIGN KEY (rollno) REFERENCES students(rollno) ON DELETE CASCADE
);
