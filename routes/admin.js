const express = require('express');
const fs = require('fs').promises; // Use Promise-based FS
const fsSync = require('fs'); // Keep sync for checking existence if needed
const router = express.Router();
const db = require('../db'); // Uses the Pool from your new db.js
const path = require('path');

const promiseDb = db.promise();

// Helper function to delete a single file (Async)
async function deleteFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Ignore "File not found" errors
      console.error(`Error deleting file: ${filePath}`, err);
    }
  }
}

// Helper function to delete files with a prefix (Async)
async function deleteFiles(dir, prefix) {
  try {
    const files = await fs.readdir(dir);
    const matchingFiles = files.filter((file) => file.startsWith(prefix));

    if (matchingFiles.length === 0) return;

    // Delete all matching files in parallel
    await Promise.all(
      matchingFiles.map((file) => fs.unlink(path.join(dir, file)))
    );
  } catch (err) {
    console.error(`Error cleaning up files in ${dir}:`, err);
  }
}

// --- Routes ---

// Admin Login Page
router.get('/login', (req, res) => {
  const message = req.session.message;
  req.session.message = null;
  res.render('admin/login', { message });
});

// Admin Login Logic
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [admins] = await promiseDb.query(
      'SELECT * FROM admin_login WHERE username = ?',
      [username]
    );

    if (admins.length === 0) {
      req.session.message = 'Wrong Credentials.';
      return res.redirect('/admin/login');
    }

    const admin = admins[0];

    if (password === admin.password) {
      req.session.admin = admin;
      res.redirect('/admin/dashboard');
    } else {
      req.session.message = 'Wrong Credentials.';
      res.redirect('/admin/login');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

// Admin Dashboard
router.get('/dashboard', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');
  res.render('admin/dashboard');
});

// View All Students
router.get('/students', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  try {
    const [students] = await promiseDb.query('SELECT * FROM students');
    res.render('admin/student_list', { students });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching students');
  }
});

// Edit Student Page
router.get('/students/edit/:rollno', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  try {
    const [results] = await promiseDb.query(
      'SELECT * FROM students WHERE rollno = ?',
      [req.params.rollno]
    );
    res.render('admin/edit_student', { student: results[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching student');
  }
});

// Update Student Logic
router.post('/update-student', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const s = req.body;
  const updatesql = `
    UPDATE students SET 
    student_name = ?, father_name = ?, dob = ?, gender = ?, religion = ?, 
    category = ?, phone_no = ?, email = ?, department = ?, year_of_admission = ?, 
    nationality = ?, domicile_state = ?, district = ?, pin_code = ?, 
    permanent_address = ?, correspondence_address = ?, marital_status = ? 
    WHERE rollno = ?`;

  const values = [
    s.student_name,
    s.father_name,
    s.dob,
    s.gender,
    s.religion,
    s.category,
    s.phone_no,
    s.email,
    s.department,
    s.year_of_admission,
    s.nationality,
    s.domicile_state,
    s.district,
    s.pin_code,
    s.permanent_address,
    s.correspondence_address,
    s.marital_status,
    s.rollno,
  ];

  try {
    await promiseDb.query(updatesql, values);
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating student.');
  }
});

// Delete Student Route
router.delete('/students/delete/:rollno', async (req, res) => {
  if (!req.session.admin)
    return res.status(403).json({ error: 'Unauthorized' });

  const { rollno } = req.params;

  try {
    // 1. Delete from Database
    const [result] = await promiseDb.query(
      'DELETE FROM students WHERE rollno = ?',
      [rollno]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // 2. Delete Files (Profile Pic & Offer Letters)
    const profilePicDir = path.join(
      __dirname,
      '..',
      'public',
      'uploads',
      'profile_pics'
    );
    const offerLetterDir = path.join(
      __dirname,
      '..',
      'public',
      'uploads',
      'offer_letters'
    );

    // Run file deletions in parallel
    await Promise.all([
      deleteFiles(profilePicDir, `profile_pic_${rollno}`),
      deleteFiles(offerLetterDir, `offer_letter_${rollno}`),
    ]);

    res.json({ success: true, message: 'Student deleted successfully!' });
  } catch (err) {
    console.error('Error deleting student:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Search Students
router.post('/students/search', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const { search_query } = req.body;
  const query = `SELECT * FROM students WHERE student_name LIKE ? OR department LIKE ? OR rollno LIKE ?`;
  const wildCard = `${search_query}%`;

  try {
    const [students] = await promiseDb.query(query, [
      wildCard,
      wildCard,
      wildCard,
    ]);
    res.json({ students });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Student Details (Parallel Fetching)
router.get('/student-details/:rollno', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const rollno = req.params.rollno;

  try {
    const [studentRes, jobRes] = await Promise.all([
      promiseDb.query('SELECT * FROM students WHERE rollno = ?', [rollno]),
      promiseDb.query('SELECT * FROM job_details WHERE rollno = ?', [rollno]),
    ]);

    res.render('admin/student_details', {
      studentDetails: studentRes[0][0],
      jobDetails: jobRes[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Student Job Details View
router.get('/student-job-details/:rollno', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const rollno = req.params.rollno;

  try {
    const [studentRes, jobRes] = await Promise.all([
      promiseDb.query('SELECT * FROM students WHERE rollno = ?', [rollno]),
      promiseDb.query('SELECT * FROM job_details WHERE rollno = ?', [rollno]),
    ]);

    res.render('admin/view_jobs', {
      studentDetails: studentRes[0][0],
      jobDetails: jobRes[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Add Courses Page
router.get('/add-courses', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');
  const message = req.session.message;
  req.session.message = null;
  res.render('admin/add_courses', { message });
});

// Add Courses Logic (Batch Insert)
router.post('/add-courses', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  // Handle cases where inputs might be strings (single entry) or arrays (multiple entries)
  const ensureArray = (input) => (Array.isArray(input) ? input : [input]);

  const courseCodes = ensureArray(req.body.course_code);
  const courseNames = ensureArray(req.body.course_name);
  const courseTypes = ensureArray(req.body.course_type);
  const credits = ensureArray(req.body.credits);
  const minMarks = ensureArray(req.body.min_marks);
  const maxMarks = ensureArray(req.body.max_marks);

  const { department, semester } = req.body; // These are usually single values for the batch

  try {
    const insertPromises = courseCodes.map((code, i) => {
      const course = {
        course_code: code,
        course_name: courseNames[i],
        course_type: courseTypes[i],
        department: department,
        semester: semester,
        credits: credits[i],
        min_marks: minMarks[i],
        max_marks: maxMarks[i],
      };
      return promiseDb.query('INSERT INTO courses SET ?', course);
    });

    // Wait for ALL inserts to complete
    await Promise.all(insertPromises);

    req.session.message = 'Course Details Added';
    res.redirect('/admin/view-courses');
  } catch (err) {
    console.error(err);
    req.session.message = 'Error adding courses';
    res.redirect('/admin/add-courses');
  }
});

// Add Marks Page
router.get('/add-marks/:rollno/:semester', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const { rollno, semester } = req.params;

  try {
    // 1. Check if marks already exist
    const [existingMarks] = await promiseDb.query(
      'SELECT * FROM student_marks WHERE rollno = ? AND semester = ?',
      [rollno, semester]
    );

    if (existingMarks.length > 0) {
      return res.send(
        `<script>alert("Marks Already Added!"); window.location.href = "/admin/student-details/${rollno}";</script>`
      );
    }

    // 2. Fetch courses for this student's dept & semester
    const query = `
      SELECT c.* FROM courses c
      JOIN students s ON s.department = c.department
      WHERE s.rollno = ? AND c.semester = ?
    `;
    const [courses] = await promiseDb.query(query, [rollno, semester]);

    // 3. Calculate Totals
    const sumQuery = `
      SELECT SUM(c.min_marks) AS total_min_marks, SUM(c.max_marks) AS total_max_marks, SUM(c.credits) AS total_credits
      FROM students s JOIN courses c ON s.department = c.department 
      WHERE s.rollno = ? AND c.semester = ?;
    `;
    const [sumMarks] = await promiseDb.query(sumQuery, [rollno, semester]);

    // 4. Get Student Name
    const [studentInfo] = await promiseDb.query(
      'SELECT student_name, year_of_admission FROM students WHERE rollno = ?',
      [rollno]
    );

    res.render('admin/add_marks', {
      courses,
      rollno,
      student_name: studentInfo[0].student_name,
      student_admission_year: studentInfo[0].year_of_admission,
      semester,
      total_min_marks: sumMarks[0].total_min_marks,
      total_max_marks: sumMarks[0].total_max_marks,
      total_credits: sumMarks[0].total_credits,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database query error');
  }
});

// Add Marks Logic (Bulk Insert)
router.post('/add-marks', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const {
    rollno,
    semester,
    session,
    marks,
    total_min_marks,
    total_max_marks,
    total_credits,
    total_marks_obtained,
    gpa,
  } = req.body;

  // Map object to array of arrays for bulk insert
  const values = Object.keys(marks).map((course_code) => [
    rollno,
    course_code,
    session,
    marks[course_code].marks_obtained,
    marks[course_code].marks_internal || null,
    marks[course_code].grade,
    marks[course_code].semester,
  ]);

  const marksQuery = `
    INSERT INTO student_marks (rollno, course_code, session, marks_obtained, marks_internal, grade, semester)
    VALUES ?
    ON DUPLICATE KEY UPDATE
    marks_obtained = VALUES(marks_obtained),
    marks_internal = VALUES(marks_internal),
    grade = VALUES(grade),
    semester = VALUES(semester)
  `;

  try {
    // Insert individual marks
    await promiseDb.query(marksQuery, [values]);

    // Insert Total Summary
    const totalMarksValues = {
      rollno,
      semester,
      session,
      total_min_marks,
      total_max_marks,
      total_credits,
      total_marks_obtained,
      gpa,
    };
    await promiseDb.query(
      'INSERT INTO student_total_marks SET ?',
      totalMarksValues
    );

    res.redirect(`/admin/student-details/${rollno}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error saving marks');
  }
});

// View Marks
router.get('/marks/:rollno', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

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

    if (results.length === 0) {
      return res.send(
        `<script>alert("Marks Not Added!"); window.location.href = "/admin/student-details/${rollno}";</script>`
      );
    }

    // Group results
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

    const [studentInfo] = await promiseDb.query(
      'SELECT student_name, department, profile_pic FROM students WHERE rollno = ?',
      [rollno]
    );

    res.render('admin/student_marks', {
      semesters,
      sem: Object.keys(semesters),
      rollno,
      student_detail: studentInfo[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching marks');
  }
});

// View Courses
router.get('/view-courses', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const message = req.session.message;
  req.session.message = null;

  try {
    const [courses] = await promiseDb.query(
      'SELECT * FROM courses ORDER BY department'
    );
    res.render('admin/view_courses', { message, courses });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching courses');
  }
});

// Search Courses
router.post('/view-courses/search', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const { search_query } = req.body;
  const wildCard = `${search_query}%`;
  const query = `SELECT * FROM courses WHERE course_code LIKE ? OR course_name LIKE ? OR semester LIKE ? OR department LIKE ?`;

  try {
    const [courses] = await promiseDb.query(query, [
      wildCard,
      wildCard,
      wildCard,
      wildCard,
    ]);
    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Edit Course Page
router.get('/edit-course/:course_code', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  try {
    const [result] = await promiseDb.query(
      'SELECT * FROM courses WHERE course_code = ?',
      [req.params.course_code]
    );
    res.render('admin/edit_course', { course: result[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
});

// Update Course Logic
router.post('/edit-course/:course_code', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const { course_code } = req.params;
  const c = req.body;
  const query =
    'UPDATE courses SET course_name = ?, course_type = ?, department = ?, semester = ?, credits = ?, min_marks = ?, max_marks = ? WHERE course_code = ?';
  const values = [
    c.course_name,
    c.course_type,
    c.department,
    c.semester,
    c.credits,
    c.min_marks,
    c.max_marks,
    course_code,
  ];

  try {
    await promiseDb.query(query, values);
    res.redirect('/admin/view-courses');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/view-courses');
  }
});

// Delete Course
router.post('/delete/:course_code', async (req, res) => {
  try {
    await promiseDb.query('DELETE FROM courses WHERE course_code = ?', [
      req.params.course_code,
    ]);
    res.redirect('/admin/view-courses');
  } catch (err) {
    req.session.message = 'You cannot Delete this course (it might be in use)';
    res.redirect('/admin/view-courses');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/admin/login');
  });
});

module.exports = router;
