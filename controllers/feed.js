const { validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');

const io = require('../socket');
const Post = require('../models/post');
const User = require('../models/user');

exports.getPosts = async (req, res, next) => {
    const currentPage = req.query.page || 1;
    const perPage = 4;
    try {
        let totalItems = await Post.find().countDocuments()
        const posts = await Post.find()
            .populate('creator')
            .sort({createdAt: -1})
            .skip((currentPage - 1) * perPage).limit(perPage);
        res.status(200).json({
            message: 'Posts fetched successfully!',
            posts: posts,
            totalItems: totalItems
        });
    } catch(err) {
            if(!err.statusCode){
                err.statusCode = 500;
            }
            next(err);
    }
};



exports.createPost = async (req, res, next) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        const error = new Error('Validation failed, entered data is incorrect!');
        error.statusCode = 422;
        throw error;
    }
    if(!req.file) {
        const error = new Error('Image not found');
        error.statusCode = 422;
        throw error;
    }
    const imageUrl = req.file.path.replace("\\", "/");
    const title = req.body.title;
    const content = req.body.content;
    const post = new Post({
        title: title,
        imageUrl: imageUrl,
        content: content,
        creator: req.userId,
    });
    try {
        await post.save();
        const user = await User.findById(req.userId);
        user.posts.push(post);
        await user.save();
        console.log({post: post, post_doc: post._doc});
        io.getIO().emit('posts', {
            action: 'create',
            post: {...post.toJSON(), creator: {_id: req.userId, name: user.name}}  //...post._doc can be used instead
        });
        res.status(201).json({
            message: 'Post created successfully',
            post: post,
            creator: {_id: user._id, name: user.name }
        })
    } catch (err) {
        if(!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }

};


exports.getPost = async (req, res, next) => {
    const postId = req.params.postId;
    const post = await Post.findById(postId);
    try {
        if (!post) {
            const error = new Error('Could not find post!');
            error.statusCode = 404;
            throw error;
        }
        res.status(200).json({message: 'Post fetched.', post: post});
    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
};



exports.updatePost = async (req, res, next) => {
    const postId = req.params.postId;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const error = new Error('Validation failed, entered data is incorrect!');
        error.statusCode = 422;
        throw error;
    }
    const title = req.body.title;
    const content = req.body.content;
    let imageUrl = req.body.image;
    if (req.file) {
        imageUrl = req.file.path.replace("\\", "/");
    }
    if (!imageUrl) {
        const error = new Error('No file picked');
        error.statusCode = 422;
        throw error;
    }
    try {
        const post = await Post.findById(postId).populate('creator');
        if (!post) {
            const error = new Error('Could not find post!');
            error.statusCode = 404;
            throw error;
        }
        if (post.creator._id.toString() !== req.userId) {
            const error = new Error('Not authorized!');
            error.statusCode = 403;
            throw error;
        }
        if (imageUrl !== post.image) {
            clearImage(post.imageUrl);
        }
        post.title = title;
        post.imageUrl = imageUrl;
        post.content = content;
        const result = await post.save();
        io.getIO().emit('posts', {action: 'update', post: result});
        res.status(200).json({message: 'Post updated', post: result})
    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
};


exports.deletePost = async (req, res, next) => {
    const postId = req.params.postId;
    try {
        const post = await Post.findById(postId);
        if(!post) {
            const error = new Error('Could not find post!');
            error.statusCode = 404;
            throw error;
        }
        if(post.creator.toString() !== req.userId) {
            const error = new Error('Not authorized!');
            error.statusCode = 403;
            throw error;
        }
        clearImage(post.imageUrl);
        await Post.findByIdAndRemove(postId);
        const user = await User.findById(req.userId);
        user.posts.pull(postId);
        await user.save();
        io.getIO().emit('posts', {action: 'delete', post: postId});
        res.status(200).json({message: 'Post was successfully deleted!'});
    } catch (err) {
        if(!err.statusCode){
            err.statusCode = 500;
        }
        next(err);
    }
};

const clearImage = filePath => {
    filePath = path.join(__dirname, '..', filePath);
    fs.unlink(filePath, err => console.log(err));
};

//then-catch code

// exports.getPosts =  (req, res, next) => {
//     const currentPage = req.query.page || 1;
//     const perPage = 2;
//     let totalItems;
//     Post.find().countDocuments().then(count => {
//             totalItems = count;
//             return  Post.find().populate('creator').skip((currentPage - 1) * perPage).limit(perPage);})
//         .then(posts => {res.status(200).json({
//                             message: 'Posts fetched successfully!',
//                             posts: posts, totalItems: totalItems});})
//         .catch(err => {if(!err.statusCode){err.statusCode = 500;}
//                 next(err);})};

// exports.createPost = (req, res, next) => {
//     const errors = validationResult(req);
//     if(!errors.isEmpty()){
//         const error = new Error('Validation failed, entered data is incorrect!');
//         error.statusCode = 422;
//         throw error;
//     }
//     if(!req.file) {
//         const error = new Error('Image not found');
//         error.statusCode = 422;
//         throw error;
//     }
//     const imageUrl = req.file.path.replace("\\", "/");
//     const title = req.body.title;
//     const content = req.body.content;
//     let creator;
//     const post = new Post({
//         title: title,
//         imageUrl: imageUrl,
//         content: content,
//         creator: req.userId,
//     });
//     post.save().then(result => {return User.findById(req.userId);})
//         .then(user => {
//             creator = user;
//             user.posts.push(post);
//             user.save();
//         })
//         .then(result => {res.status(201).json({
//                 message: 'Post created successfully',
//                 post: post,
//                 creator: {_id: creator._id, name: creator.name }
//             })
//         })
//         .catch(err => {
//             if(!err.statusCode) {
//                 err.statusCode = 500;
//             }
//             next(err);
//         });
// };

// exports.getPost = (req, res, next) => {
//     const postId = req.params.postId;
//     Post.findById(postId)
//         .then(post => {
//             if(!post) {
//                 const error = new Error('Could not find post!');
//                 error.statusCode = 404;
//                 throw error;
//             }
//             res.status(200).json({message: 'Post fetched.', post: post});
//         })
//         .catch(err => {
//             if(!err.statusCode) {
//                 err.statusCode = 500;
//             }
//             next(err);
//         });
// }

// exports.updatePost = (req, res, next) => {
//     const errors = validationResult(req);
//     if(!errors.isEmpty()){
//         const error = new Error('Validation failed, entered data is incorrect!');
//         error.statusCode = 422;
//         throw error;
//     }
//     const postId = req.params.postId;
//     const title = req.body.title;
//     const content = req.body.content;
//     let imageUrl = req.body.image;
//     if(req.file) {
//         imageUrl = req.file.path.replace("\\", "/");
//     }
//     if(!imageUrl) {
//         const error = new Error('No file picked');
//         error.statusCode = 422;
//         throw error;
//     }
//     Post.findById(postId)
//         .then(post => {
//             if(!post){
//                 const error = new Error('Could not find post!');
//                 error.statusCode = 404;
//                 throw error;
//             }
//             if(post.creator.toString() !== req.userId){
//                 const error = new Error('Not authorized!');
//                 error.statusCode = 403;
//                 throw error;
//             }
//             if(imageUrl !== post.image) {
//                 clearImage(post.imageUrl);
//             }
//             post.title  = title;
//             post.imageUrl = imageUrl;
//             post.content = content;
//             return post.save();
//         })
//         .then(result => {
//             res.status(200).json({message: 'Post updated', post: result})
//         })
//         .catch(err => {
//             if(!err.statusCode) {
//                 err.statusCode = 500;
//             }
//             next(err);
//         });
// };

// exports.deletePost = (req, res, next) => {
//     const postId = req.params.postId;
//     Post.findById(postId)
//         .then(post => {
//             //Check logged in user
//             if(post.creator.toString() !== req.userId) {
//                 const error = new Error('Not authorized!');
//                 error.statusCode = 403;
//                 throw error;
//             }
//             if(!post) {
//                 const error = new Error('Could not find post!');
//                 error.statusCode = 404;
//                 throw error;
//             }
//
//             clearImage(post.imageUrl);
//             return Post.findByIdAndRemove(postId);
//         })
//         .then(result => {
//             return User.findById(req.userId);
//         })
//         .then(user => {
//             user.posts.pull(postId);
//             user.save();
//         })
//         .then(result => {
//             console.log(result);
//             res.status(200).json({message: 'Post was successfully deleted!'});
//         })
//         .catch(err => {
//             if(!err.statusCode){
//                 err.statusCode = 500;
//             }
//             next(err);
//         })
// };