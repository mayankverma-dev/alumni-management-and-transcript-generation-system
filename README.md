# Alumni Management and Transcript Generation System

## Project Overview

The **Alumni Management and Transcript Generation System** is a web application designed to help universities manage information about alumni, including their current job positions and job history. It also facilitates the generation of transcripts for students.

## Features

- Alumni Registration
- Job History Management
- Transcript Generation
- Admin Dashboard for managing students and courses
- Secure Login for Admin and Students

## Technologies Used

- Node.js
- Express.js
- MySQL
- EJS (Embedded JavaScript)
- Axios
- Express-session
- Multer

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/aniket-thapa/alumni-management-and-transcript-generation-system.git
   cd alumni-management-and-transcript-generation-system
   ```

2. Install the dependencies:

   ```bash
   npm install
   ```

3. Set up the MySQL database:

   - Create a database named `university_db`
   - Run the given SQL script [mysql_db_query.sql](https://github.com/aniket-thapa/alumni-management-and-transcript-generation-system/blob/main/mysql_db_query.sql) to create the necessary tables.

4. Configure the database connection in `db.js` and create `.env` file:

```
SESSION_SECRET=
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=university_db
DB_PORT=3306
RECAPTCHA_SECRET_KEY=
PORT=3000
NODE_ENV=production
DB_SSL_CA=
```

5. Start the server:
   ```bash
   node app.js
   ```

## Usage

- Access the application at `http://localhost:3000`
- Admin login: `/admin/login`
- Student login: `/student/login`

## Routes

- **Home Route**:

  ```javascript
  app.get('/', (req, res) => {
    res.render('index');
  });
  ```

- **Student Routes**: `routes/student.js`
- **Admin Routes**: `routes/admin.js`

## Contact

Created by [Aniket Thapa](https://www.linkedin.com/in/aniket-thapa) and [Mayank Verma](https://www.linkedin.com/in/mayank-verma04) - feel free to contact us!
