const bcrypt = require('bcryptjs');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const io = require('../socket');

const User = require('../models/user');
const Post = require('../models/post');
const {clearImage} = require('../util/file');

module.exports = {
    createUser: async function({ userInput }, req) {
            //const email = userInput.email;
            const errors = [];
            if(!validator.isEmail(userInput.email)){
                errors.push({message: 'Email is invalid!'});
            }
            if(validator.isEmpty(userInput.password) || !validator.isLength(userInput.password, {min: 6})) {
                errors.push({message: 'Password is too short!'});
            }
            if(errors.length > 0) {
                const error = new Error('Invalid input!')
                error.data = errors;
                error.code = 422;
                throw error;
            }
            const existingUser = await User.findOne({email: userInput.email});
            if (existingUser) {
                const error = new Error('User already exists!');
                throw error;
            }
            const hashedPassword = await bcrypt.hash(userInput.password, 12);
            const user = new User({
                email: userInput.email,
                name: userInput.name,
                password: hashedPassword
            });
            const createdUser = await user.save();
            return {...createdUser._doc, _id: createdUser._id.toString() };
    },
    login: async function({email, password}) {
        const user = await User.findOne({email: email});
        if (!user) {
            const error = new Error('User not found!');
            error.code = 401;
            throw error;
        }
        const isEqual = await bcrypt.compare(password, user.password);
        if (!isEqual) {
            const error = new Error('Password is incorrect!');
            error.code = 401;
            throw error;
        }
        const token = jwt.sign({
                userId: user._id.toString(),
                email: user.email
            }, 'somesupersecretsecret',
            {expiresIn: '1h'}
        );
        return {token: token, userId: user._id.toString()};
    },
    createPost: async function({postInput}, req){
        if(!req.isAuth){
            const error = new Error('Not authenticated!');
            error.code = 401;
            throw error;
        }
        const errors = [];
        if(validator.isEmpty(postInput.title) || !validator.isLength(postInput.title, {min: 5})){
            errors.push({message: 'Title is invalid!'});
        }
        if(validator.isEmpty(postInput.content) || !validator.isLength(postInput.content, {min: 5})){
            errors.push({message: 'Content is invalid!'});
        }
        if(errors.length > 0) {
            const error = new Error('Invalid input!')
            error.data = errors;
            error.code = 422;
            throw error;
        }
        const user = await User.findById(req.userId);
        if(!user){
            const error = new Error('User not found');
            error.code = 401;
            throw error;
        }
        const post = new Post({
            title: postInput.title,
            content: postInput.content,
            imageUrl: postInput.imageUrl,
            creator: user
        });
        const createdPost = await post.save();
        user.posts.push(createdPost);
        await user.save();
        io.getIO().emit('posts', {
            action: 'create',
            post: {...post.toJSON(), creator: {_id: req.userId, name: user.name}}  //...post._doc can be used instead
        });
        return {
            ...createdPost._doc,
            _id: createdPost._id.toString(),
            createdAt: createdPost.createdAt.toISOString(),
            updatedAt: createdPost.updatedAt.toISOString()
        };
    },
    posts: async function({page}, req){
        if(!req.isAuth){
            const error = new Error('Not authenticated!');
            error.code = 401;
            throw error;
        }
        if(!page) {
            page = 1;
        }
        const perPage = 4;
        const totalPosts = await Post.find().countDocuments();
        const posts = await Post.find()
            .sort({createdAt: -1})
            .skip((page -1) * perPage)
            .limit(perPage)
            .populate('creator');
        return {posts: posts.map(post => {
            return {...post._doc,
                    _id: post._id.toString(),
                    createdAt: post.createdAt.toISOString(),
                    updatedAt: post.updatedAt.toISOString()}
            }), totalPosts: totalPosts};
    },
    post: async function({id}, req){
        if(!req.isAuth){
            const error = new Error('Not authenticated!');
            error.code = 401;
            throw error;
        }
        const post = await Post.findById(id).populate('creator');
        if(!post) {
            const error = new Error('Post not found!');
            error.code = 404;
            throw error;
        }
        console.log({...post._doc,
            _id: post._id.toString(),
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString()
        })
        return {...post._doc,
                _id: post._id.toString(),
                createdAt: post.createdAt.toISOString(),
                updatedAt: post.updatedAt.toISOString()
        }
},
    updatePost: async function({id, postInput}, req) {
        if(!req.isAuth){
            const error = new Error('Not authenticated!');
            error.code = 401;
            throw error;
        }
        const post = await Post.findById(id).populate('creator');
        if(!post) {
            const error = new Error('Post not found!');
            error.code = 404;
            throw error;
        }
        if(req.userId.toString() !== post.creator._id.toString()){
            const error = new Error('Not authorized!');
            error.code = 403;
            throw error;
        }
        const errors = [];
        if(validator.isEmpty(postInput.title) || !validator.isLength(postInput.title, {min: 5})){
            errors.push({message: 'Title is invalid!'});
        }
        if(validator.isEmpty(postInput.content) || !validator.isLength(postInput.content, {min: 5})){
            errors.push({message: 'Content is invalid!'});
        }
        if(errors.length > 0) {
            const error = new Error('Invalid input!')
            error.data = errors;
            error.code = 422;
            throw error;
        }
        post.title = postInput.title;
        post.content = postInput.content;
        if(postInput.imageUrl !== 'undefined') {
            clearImage(post.imageUrl);
            post.imageUrl = postInput.imageUrl;
        }
        const updatedPost = await post.save();
        io.getIO().emit('posts', {action: 'update', post: updatedPost});
        return {...updatedPost._doc,
        _id: updatedPost._id.toString(),
        createdAt: updatedPost.createdAt.toISOString(),
        updatedAt: updatedPost.updatedAt.toISOString()}
    },
    deletePost: async function({id}, req){
        if(!req.isAuth){
            const error = new Error('Not authenticated!');
            error.code = 401;
            throw error;
        }
        const post = await Post.findById(id);
        if(!post) {
            const error = new Error('Post not found!');
            error.code = 404;
            throw error;
        }
        if(req.userId.toString() !== post.creator.toString()){
            const error = new Error('Not authorized!');
            error.code = 403;
            throw error;
        }
        clearImage(post.imageUrl);
        await Post.findByIdAndRemove(id);
        const user = await User.findById(req.userId);
        user.posts.pull(id);
        await user.save();
        io.getIO().emit('posts', {action: 'delete', post: id});
        return true;
    },
    user: async function(args, req){
        if(!req.isAuth){
            const error = new Error('Not authenticated!');
            error.code = 401;
            throw error;
        }
        const user = await User.findById(req.userId);
        if (!user) {
            const error = new Error('User not found!');
            error.code = 401;
            throw error;
        }
        return {...user._doc, _id: user._id.toString()};
    },
    updateStatus: async function({status}, req){
        if(!req.isAuth){
            const error = new Error('Not authenticated!');
            error.code = 401;
            throw error;
        }
        const user = await User.findById(req.userId);
        if (!user) {
            const error = new Error('User not found!');
            error.code = 401;
            throw error;
        }
        user.status = status;
        await user.save();
        return {...user._doc, _id: user._id.toString()};
    },
}

