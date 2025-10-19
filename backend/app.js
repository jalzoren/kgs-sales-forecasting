// Filename - app.js 

// Importing modules
const express = require('express');
const mysql = require('mysql');

const app = express();
const PORT = 3000;

// Create a connection to the database
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'yourpassword',
  database: "ExpressIntegration"        
});

// open the MySQL connection
connection.connect(error => {
    if (error){
        console.log("A error has been occurred "
            + "while connecting to database.");        
        throw error;
    }
    
    //If Everything goes correct, Then start Express Server
    app.listen(PORT, ()=>{
        console.log("Database connection is Ready and "
            + "Server is Listening on Port ", PORT);
    })
});