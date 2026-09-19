// routes/student.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // Use the pool from db.js
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const PdfPrinter = require('pdfmake');
const fs = require('fs');
const bcrypt = require('bcrypt');
const qrcode = require('qrcode'); // NEW: QR Code Generator
const jwt = require('jsonwebtoken'); // NEW: For Encryption/Signing

const promiseDb = db.promise();

// --- Multer Setup ---
const storageProfilePic = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/profile_pics'),
  filename: (req, file, cb) => {
    if (!req.session.student?.rollno)
      return cb(new Error('Session data missing'));
    cb(
      null,
      `profile_pic_${req.session.student.rollno}${path.extname(
        file.originalname
      )}`
    );
  },
});
const uploadProfilePic = multer({ storage: storageProfilePic });

const storageOfferLetter = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/offer_letters'),
  filename: (req, file, cb) => {
    if (!req.session.student?.rollno)
      return cb(new Error('Session data missing'));
    const cleanCompanyName = req.body.company_name.replace(
      /[^a-zA-Z0-9]/g,
      '_'
    );
    cb(
      null,
      `offer_letter_${
        req.session.student.rollno
      }_${cleanCompanyName}${path.extname(file.originalname)}`
    );
  },
});
const uploadOfferLetter = multer({ storage: storageOfferLetter });

// ==========================================
// NEW: Public Verification Route
// This handles the QR code scan
// ==========================================
router.get('/verify-document/:token', (req, res) => {
  const { token } = req.params;

  try {
    // 1. Verify the Digital Signature using the Secret Key
    // If the token was tampered with, this will throw an error
    const decoded = jwt.verify(
      token,
      process.env.SESSION_SECRET || 'fallback_secret'
    );

    // 2. Show Success Page
    res.render('student/verify_success', { data: decoded, token: token });
  } catch (err) {
    // 3. Show Error if Token is fake or expired
    res.status(400).send(`
      <div style="text-align:center; padding:50px; font-family:sans-serif; color:red;">
        <h1>❌ Verification Failed</h1>
        <p>This QR code is invalid, expired, or has been tampered with.</p>
      </div>
    `);
  }
});

// --- Standard Routes ---

router.get('/registration', (req, res) => res.render('student/registration'));

router.post('/registration', async (req, res) => {
  let { rollno, dob, 'g-recaptcha-response': captcha } = req.body;

  // Remove CAPTCHA for Development Environment
  if (process.env.NODE_ENV === 'development') {
    captcha = 'dummy_captcha';
  }

  if (!captcha)
    return res.render('student/registration', {
      error: 'Please complete the CAPTCHA.',
    });

  try {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captcha}`;
    const captchaResponse = await axios.post(verifyURL);

    if (!captchaResponse.data.success && process.env.NODE_ENV !== 'development')
      return res.render('student/registration', {
        error: 'Captcha verification failed.',
      });

    const [existingStudent] = await promiseDb.query(
      'SELECT * FROM students WHERE rollno = ?',
      [rollno]
    );
    if (existingStudent.length > 0)
      return res.render('student/registration', { error: 'exists' });

    const hashedPassword = await bcrypt.hash(dob, 10);

    await promiseDb.query('INSERT INTO students (rollno, dob) VALUES (?, ?)', [
      rollno,
      dob,
    ]);
    await promiseDb.query(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [rollno, hashedPassword]
    );

    req.session.successMessage =
      'Registered successfully. Log in with your Date of Birth as password.';
    res.redirect('/student/login');
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).send('Internal Server Error during registration.');
  }
});

router.get('/login', (req, res) => {
  const { successMessage, message } = req.session;
  req.session.successMessage = null;
  req.session.message = null;
  res.render('student/login', { successMessage, message });
});

router.post('/login', async (req, res) => {
  let { rollno, password, 'g-recaptcha-response': captcha } = req.body;

  // Remove CAPTCHA for Development Environment
  if (process.env.NODE_ENV === 'development') {
    captcha = 'dummy_captcha';
  }

  if (!captcha) {
    req.session.message = 'Please complete the CAPTCHA.';
    return res.redirect('/student/login');
  }

  try {
    const captchaResponse = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${captcha}`
    );
    if (
      !captchaResponse.data.success &&
      process.env.NODE_ENV !== 'development'
    ) {
      req.session.message = 'Captcha verification failed.';
      return res.redirect('/student/login');
    }

    const [users] = await promiseDb.query(
      'SELECT * FROM users WHERE username = ?',
      [rollno]
    );
    if (users.length === 0) {
      req.session.message = 'Wrong Credentials or Not Registered.';
      return res.redirect('/student/login');
    }

    const match = await bcrypt.compare(password, users[0].password);
    if (!match) {
      req.session.message = 'Wrong Credentials.';
      return res.redirect('/student/login');
    }

    const [students] = await promiseDb.query(
      'SELECT * FROM students WHERE rollno = ?',
      [rollno]
    );
    req.session.student = students[0];

    if (password === students[0].dob) {
      res.redirect('/student/change-password');
    } else {
      res.redirect('/student/dashboard');
    }
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/change-password', (req, res) => {
  if (!req.session.student) return res.redirect('/student/login');
  if (req.session.passwordChanged) return res.redirect('/student/dashboard');
  res.render('student/change_password', { student: req.session.student });
});

router.post('/change-password', async (req, res) => {
  const { dob, rollno, new_password, confirm_password } = req.body;
  if (new_password !== confirm_password)
    return res.status(400).send('Passwords do not match');

  try {
    const [students] = await promiseDb.query(
      'SELECT * FROM students WHERE rollno = ? AND dob = ?',
      [rollno, dob]
    );
    if (students.length > 0) {
      const hashedPassword = await bcrypt.hash(new_password, 10);
      await promiseDb.query(
        'UPDATE users SET password = ? WHERE username = ?',
        [hashedPassword, rollno]
      );
      req.session.passwordChanged = true;
      req.session.successMessage =
        'Password changed successfully. Please login again.';
      res.redirect('/student/login');
    } else {
      res.status(400).send('Invalid credentials');
    }
  } catch (err) {
    res.status(500).send('Error changing password');
  }
});

router.get('/reset-password', (req, res) => {
  const message = req.session.message;
  req.session.message = null;
  res.render('student/reset-password', { message });
});

router.post('/reset-password', async (req, res) => {
  const { rollno, student_name, dob, phone_no, email, password } = req.body;
  try {
    const verifyQuery = `SELECT * FROM students WHERE rollno = ? AND student_name = ? AND dob = ? AND phone_no = ? AND email = ?`;
    const [results] = await promiseDb.query(verifyQuery, [
      rollno,
      student_name,
      dob,
      phone_no,
      email,
    ]);

    if (results.length === 0) {
      req.session.message = 'Verification failed. Please check your details.';
      return res.redirect('/student/reset-password');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await promiseDb.query('UPDATE users SET password = ? WHERE username = ?', [
      hashedPassword,
      rollno,
    ]);
    req.session.successMessage = 'Password updated successfully.';
    res.redirect('/student/login');
  } catch (err) {
    req.session.message = 'An error occurred.';
    res.redirect('/student/reset-password');
  }
});

router.get('/dashboard', async (req, res) => {
  if (!req.session.student) return res.redirect('/student/login');
  try {
    const [results] = await promiseDb.query(
      'SELECT * FROM students WHERE rollno = ?',
      [req.session.student.rollno]
    );

    if (results[0].student_name == null) {
      return res.redirect('/student/register');
    }

    res.render('student/dashboard', {
      studentDetails: results.length ? results[0] : null,
    });
  } catch (err) {
    res.status(500).send('Error fetching details');
  }
});

router.get('/profile', async (req, res) => {
  if (!req.session.student) return res.redirect('/student/login');
  try {
    const [results] = await promiseDb.query(
      'SELECT * FROM students WHERE rollno = ?',
      [req.session.student.rollno]
    );
    res.render('student/profile', { studentDetails: results[0] });
  } catch (err) {
    res.status(500).send('Error fetching profile');
  }
});

router.get('/register', (req, res) => {
  if (!req.session.student) return res.redirect('/student/login');
  if (req.session.student.student_name)
    return res.redirect('/student/dashboard');
  res.render('student/register', { student: req.session.student });
});

router.post(
  '/register',
  uploadProfilePic.single('profile_pic'),
  async (req, res) => {
    if (!req.session.student?.rollno)
      return res.status(400).send('Session expired.');
    const studentData = {
      ...req.body,
      profile_pic: req.file ? req.file.filename : null,
    };
    try {
      await promiseDb.query('UPDATE students SET ? WHERE rollno = ?', [
        studentData,
        req.session.student.rollno,
      ]);
      res.redirect('/student/dashboard');
    } catch (err) {
      res.status(500).send('Error updating profile');
    }
  }
);

router.get('/job-details', (req, res) => {
  if (!req.session.student) return res.redirect('/student/login');
  const message = req.session.message;
  req.session.message = null;
  res.render('student/job_details', { student: req.session.student, message });
});

router.post(
  '/job-details',
  uploadOfferLetter.single('offer_letter'),
  async (req, res) => {
    if (!req.session.student) return res.redirect('/student/login');
    const {
      rollno,
      date_of_joining,
      company_name,
      address_of_company,
      date_of_leaving,
    } = req.body;
    if (new Date(date_of_leaving) <= new Date(date_of_joining)) {
      req.session.message =
        'Date of leaving must be greater than date of joining.';
      return res.redirect('/student/job-details');
    }
    const job = {
      rollno,
      date_of_joining,
      company_name,
      address_of_company,
      date_of_leaving,
      offer_letter: req.file.filename,
    };
    try {
      await promiseDb.query('INSERT INTO job_details SET ?', job);
      res.redirect('/student/dashboard');
    } catch (err) {
      res.status(500).send('Error saving job details');
    }
  }
);

router.get('/view-jobs', async (req, res) => {
  if (!req.session.student) return res.redirect('/student/login');
  try {
    const [studentDetails] = await promiseDb.query(
      'SELECT * FROM students WHERE rollno = ?',
      [req.session.student.rollno]
    );
    const [jobDetails] = await promiseDb.query(
      'SELECT * FROM job_details WHERE rollno = ?',
      [req.session.student.rollno]
    );
    const message = req.session.message;
    req.session.message = null;
    res.render('student/view-jobs', { studentDetails, jobDetails, message });
  } catch (err) {
    res.status(500).send('Internal Server Error');
  }
});

router.post('/update-date-of-leaving', async (req, res) => {
  if (!req.session.student) return res.redirect('/student/login');
  const { company_name, date_of_leaving } = req.body;
  const rollno = req.session.student.rollno;
  try {
    const [result] = await promiseDb.query(
      'SELECT date_of_joining FROM job_details WHERE rollno = ? AND company_name = ?',
      [rollno, company_name]
    );
    if (result.length === 0) return res.status(404).send('Job not found');
    if (new Date(date_of_leaving) <= new Date(result[0].date_of_joining)) {
      req.session.message =
        'Date of leaving must be greater than date of joining.';
      return res.redirect('/student/view-jobs');
    }
    await promiseDb.query(
      'UPDATE job_details SET date_of_leaving = ? WHERE rollno = ? AND company_name = ?',
      [date_of_leaving, rollno, company_name]
    );
    res.redirect('/student/view-jobs');
  } catch (err) {
    res.status(500).send('Error updating job');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/student/login');
  });
});

router.get('/marks/:rollno', async (req, res) => {
  if (!req.session.student) return res.redirect('/student/login');
  const rollno = req.params.rollno;
  const query = `
    SELECT sm.semester, c.course_code, c.course_name, c.course_type, c.min_marks, c.max_marks, c.credits, 
           sm.marks_obtained, sm.marks_internal, sm.grade, 
           stm.total_min_marks, stm.total_max_marks, stm.total_marks_obtained, stm.total_credits, stm.gpa 
    FROM student_marks sm 
    JOIN courses c ON sm.course_code = c.course_code 
    JOIN student_total_marks stm ON sm.rollno = stm.rollno AND sm.semester = stm.semester 
    WHERE sm.rollno = ? ORDER BY sm.semester, c.course_code`;

  try {
    const [results] = await promiseDb.query(query, [rollno]);
    if (results.length === 0)
      return res.send(
        `<script>alert("Marks Not Added!"); window.location.href = "/student/dashboard";</script>`
      );

    const semesters = {};
    results.forEach((result) => {
      if (!semesters[result.semester]) {
        semesters[result.semester] = {
          courses: [],
          total_min_marks: result.total_min_marks,
          total_max_marks: result.total_max_marks,
          total_marks_obtained: result.total_marks_obtained,
          total_credits: result.total_credits,
          gpa: result.gpa,
        };
      }
      semesters[result.semester].courses.push(result);
    });

    res.render('student/student_marks', {
      semesters,
      sem: Object.keys(semesters),
      studentDetails: req.session.student,
    });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

// --- Transcript Generation with QR Code and Encryption ---
function getBase64Image(fileName) {
  try {
    const filePath = path.join(__dirname, '../public', fileName);
    const fileExt = path.extname(fileName).substring(1);
    const imageBase64 = fs.readFileSync(filePath).toString('base64');
    return `data:image/${fileExt};base64,${imageBase64}`;
  } catch (e) {
    return null;
  }
}

router.get('/transcript/:rollno', async (req, res) => {
  const rollno = req.params.rollno;

  try {
    const [studentResults] = await promiseDb.query(
      'SELECT * FROM students WHERE rollno = ?',
      [rollno]
    );
    if (studentResults.length === 0)
      return res.status(404).send('Student not found');
    const student = studentResults[0];

    const [semesterResults] = await promiseDb.query(
      'SELECT DISTINCT semester, session FROM student_marks WHERE rollno = ? ORDER BY semester',
      [rollno]
    );

    if (semesterResults.length === 0)
      return res.status(404).send('No transcript data found.');

    const transcript = [];
    let finalCGPA = 0;
    let totalSemesters = 0;

    for (const sem of semesterResults) {
      const { semester, session } = sem;
      const [courses] = await promiseDb.query(
        `
        SELECT sm.course_code, c.course_name, c.course_type, c.max_marks, c.min_marks, 
               c.credits, sm.marks_obtained, sm.marks_internal, sm.grade
        FROM student_marks sm
        JOIN courses c ON sm.course_code = c.course_code
        WHERE sm.rollno = ? AND sm.semester = ? AND sm.session = ?
      `,
        [rollno, semester, session]
      );

      const [totalResults] = await promiseDb.query(
        'SELECT * FROM student_total_marks WHERE rollno = ? AND semester = ? AND session = ?',
        [rollno, semester, session]
      );

      const total = totalResults[0] || {
        total_min_marks: 0,
        total_max_marks: 0,
        total_marks_obtained: 0,
        total_credits: 0,
        gpa: 0,
      };

      if (total.gpa) {
        finalCGPA += parseFloat(total.gpa);
        totalSemesters++;
      }

      transcript.push({ semester, session, courses, ...total });
    }

    const cgpa =
      totalSemesters > 0 ? (finalCGPA / totalSemesters).toFixed(2) : 'N/A';

    // --- ENCRYPTION & QR CODE GENERATION ---
    // 1. Create the payload to sign
    const payload = {
      rollno: student.rollno,
      name: student.student_name,
      department: student.department,
      gpa: cgpa, // Verify the CGPA
      date: new Date().toISOString(),
    };

    // 2. Sign the token (Validity: Does not expire or long expiry)
    const secret = process.env.SESSION_SECRET || 'fallback_secret';
    const token = jwt.sign(payload, secret);

    // 3. Create the Verification URL
    // NOTE: In production, replace 'req.headers.host' with your actual domain (e.g., university.com)
    const verificationUrl = `${req.protocol}://${req.headers.host}/student/verify-document/${token}`;

    // 4. Generate QR Code Base64
    const qrCodeImage = await qrcode.toDataURL(verificationUrl);

    generatePDF(res, student, transcript, qrCodeImage, verificationUrl);
  } catch (err) {
    console.error('Transcript Error:', err);
    res.status(500).send('Database Error during transcript generation');
  }
});

function generatePDF(res, student, transcript, qrCodeImage, verificationUrl) {
  try {
    const fonts = {
      Times: {
        normal: 'Times-Roman',
        bold: 'Times-Bold',
        italics: 'Times-Italic',
        bolditalics: 'Times-BoldItalic',
      },
    };
    const printer = new PdfPrinter(fonts);

    const docDefinition = {
      // Encrypt the PDF so users cannot modify text
      permissions: {
        modifying: false,
        copying: false,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true,
        documentAssembly: false,
      },
      ownerPassword: 'secure_random_password_' + Math.random(), // Prevent editing

      content: [
        {
          columns: [
            { image: getBase64Image('images/JU_Logo.png') || '', width: 60 },
            {
              stack: [
                { text: 'University of Jammu, J&K', style: 'header' },
                { text: `Branch: ${student.department}`, style: 'subheader' },
                {
                  text: 'Official Academic Transcript',
                  italics: true,
                  bold: true,
                },
              ],
              alignment: 'center',
            },
            student.profile_pic
              ? {
                  image:
                    getBase64Image(
                      `uploads/profile_pics/${student.profile_pic}`
                    ) || '',
                  width: 60,
                }
              : { text: 'No Photo', fontSize: 8, italics: true },
          ],
        },
        { text: '\n' },
        {
          columns: [
            [
              { text: `Name: ${student.student_name}`, style: 'info' },
              { text: `Roll No: ${student.rollno}`, style: 'info' },
              { text: `DOB: ${student.dob}`, style: 'info' },
              { text: `Father's Name: ${student.father_name}`, style: 'info' },
            ],
            [
              { text: `Department: ${student.department}`, style: 'info' },
              {
                text: `Year of Admission: ${student.year_of_admission}`,
                style: 'info',
              },
              { text: `Category: ${student.category}`, style: 'info' },
              { text: `Nationality: ${student.nationality}`, style: 'info' },
            ],
          ],
        },
        { text: '\n' },
        ...transcript.map((sem) => [
          {
            text: `Semester ${sem.semester} - Session: ${sem.session}`,
            style: 'subheader',
            alignment: 'center',
            margin: [0, 5, 0, 5],
          },
          {
            table: {
              headerRows: 1,
              widths: [
                'auto',
                '*',
                'auto',
                'auto',
                'auto',
                'auto',
                'auto',
                'auto',
                'auto',
              ],
              body: [
                [
                  { text: 'Code', bold: true },
                  { text: 'Title', bold: true },
                  { text: 'Type', bold: true },
                  { text: 'Max', bold: true },
                  { text: 'Min', bold: true },
                  { text: 'Obt', bold: true },
                  { text: 'Int', bold: true },
                  { text: 'Grd', bold: true },
                  { text: 'Cr', bold: true },
                ],
                ...sem.courses.map((c) => [
                  c.course_code,
                  c.course_name,
                  c.course_type,
                  c.max_marks,
                  c.min_marks,
                  c.marks_obtained,
                  c.marks_internal,
                  c.grade,
                  c.credits,
                ]),
                [
                  { text: 'Total:', colSpan: 3, bold: true },
                  {},
                  {},
                  sem.total_max_marks,
                  sem.total_min_marks,
                  {
                    text: sem.total_marks_obtained,
                    colSpan: 2,
                    alignment: 'center',
                  },
                  {},
                  '',
                  sem.total_credits,
                ],
                [
                  { text: '', colSpan: 7 },
                  {},
                  {},
                  {},
                  {},
                  {},
                  {},
                  { text: 'SGPA:', bold: true },
                  { text: sem.gpa, bold: true },
                ],
              ],
            },
            fontSize: 8,
            margin: [0, 0, 0, 10],
          },
        ]),
        { text: '\n' },
        // --- FOOTER WITH QR CODE ---
        {
          columns: [
            {
              text: 'Scan to Verify Authenticity\nThis document is digitally signed.',
              fontSize: 9,
              color: 'gray',
              width: '*',
            },
            {
              image: qrCodeImage,
              width: 70,
              alignment: 'right',
            },
          ],
        },
        {
          text: `Generated on: ${new Date().toLocaleDateString()}`,
          style: 'footer',
          italics: true,
          alignment: 'right',
        },
      ],
      styles: {
        header: { fontSize: 16, bold: true },
        subheader: { fontSize: 12, bold: true },
        info: { fontSize: 9, margin: [0, 1, 0, 1] },
        footer: { fontSize: 8, margin: [0, 10, 0, 0] },
      },
      defaultStyle: { font: 'Times' },
      pageMargins: [40, 40, 40, 40],
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    pdfDoc.on('error', (err) => {
      if (!res.headersSent)
        res.status(500).json({ error: 'Failed to generate PDF' });
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Transcript_${student.rollno}.pdf"`
    );
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err) {
    console.error('Generate PDF Error:', err);
    if (!res.headersSent) res.status(500).send('Error generating PDF');
  }
}

router.use((req, res) => res.redirect('/student/dashboard'));

module.exports = router;
