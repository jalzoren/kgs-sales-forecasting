// hashPassword.js
const bcrypt = require('bcrypt');

const plainPassword = 'salesAdmin01'; // Replace this with your real password
const saltRounds = 10;

bcrypt.hash(plainPassword, saltRounds, (err, hash) => {
  if (err) {
    console.error('Error hashing password:', err);
    return;
  }
  console.log('Hashed password:', hash);
});