const express = require('express');
const { body } = require('express-validator');

const User = require('../models/user');
const authController = require('../controllers/auth');

const router = express.Router();

//PUT /auth/signup
router.put('/signup', [
    body('email', 'Please enter a valid Email!')
        .isEmail()
        .custom((value, {req}) => {
            return User.findOne({email: value}).then(userDoc => {
                if(userDoc){
                    return Promise.reject('Email already exists!');
                }
            })
        })
        .normalizeEmail(),
    body('password', 'Password should be at least 6 characters long!')
        .trim()
        .isLength({min: 6}),
    body('name')
        .trim()
        .not()
        .isEmpty()
], authController.signup);

//POST /auth/login
router.post('/login', authController.login);

module.exports = router;