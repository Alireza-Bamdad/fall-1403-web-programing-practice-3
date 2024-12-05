
const ejs = require('ejs');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const { type } = require('os');

const app = express();


app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 600000 } // 10 دقیقه
}));


mongoose.connect('mongodb://localhost/shop_db', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});


const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: function(req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function(req, file, cb) {
        checkFileType(file, cb);
    }
});

//Create Usere Detabase
const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    email: String,
    type: String // 'admin' or 'user'
});

//Create catgory Detabase
const categorySchema = new mongoose.Schema({
    name: String,
    subcategories: [{
        name: String
    }]
});

//Create ptoducts Detabase
const productSchema = new mongoose.Schema({
    name: String,
    category: String,
    subcategory: String,
    price: Number,
    description: String,
    image: String
});

const User = mongoose.model('User', userSchema);
const Category = mongoose.model('Category', categorySchema);
const Product = mongoose.model('Product', productSchema);

function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
}

//register routes

app.get('/register', (req, res) => {
    res.render('register');
});


app.post('/register', async (req, res) => {
    try {
        const existingUser = await User.findOne({ 
            $or: [
                { username: req.body.username },
                { email: req.body.email }
            ]
        });

        if (existingUser) {
            return res.render('register', { 
                error: 'نام کاربری یا ایمیل از قبل ثبت شده است' 
            });
        }

        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const user = new User({
            username: req.body.username,
            password: hashedPassword,
            email: req.body.email,
            type: 'user'
        });
        await user.save();
        res.redirect('/login');
    } catch (error) {
        res.render('register', { 
            error: 'خطا در ثبت‌نام. لطفاً مجدداً تلاش کنید' 
        });
    }
});

app.get('/', async (req, res) => {      
    try {
        const categories = await Category.find();
        const products = await Product.find();
        const loggedIn = !!req.session.user;
        res.render('index', { 
            products, 
            categories,
            loggedIn, 
            username: req.session.user ? req.session.user.username : "لطفا وارد شوید", 
            type: req.session.user ? req.session.user.type : ''
        });
    } catch (error) {
        res.render('index', { products: [], categories: [], username: "لطفا وارد شوید" });
    }
});
//login routes
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username });
        if (!user) {
            return res.render('login', { error: 'نام کاربری یافت نشد' });
        }

        const isMatch = await bcrypt.compare(req.body.password, user.password);
        if (!isMatch) {
            return res.render('login', { error: 'رمز عبور اشتباه است' });
        }

        req.session.user = {
            id: user._id,
            username: user.username,
            type: user.type
        };

        if (user.type === 'admin') {
            res.redirect('/admin');
        } else {
            res.redirect('/index');
        }
    } catch (error) {
        res.render('login', { error: 'خطا در ورود. لطفاً مجدداً تلاش کنید' });
    }
});


//main routes
app.get('/index', async (req, res) => {         
    try {
        const categories = await Category.find();
        const products = await Product.find();
        const loggedIn = !!req.session.user;
        res.render('index', { 
            products, 
            categories,
            loggedIn, 
            username: req.session.user ? req.session.user.username : "لطفا وارد شوید", 
            type: req.session.user ? req.session.user.type : ''
        });
    } catch (error) {
        res.render('index', { products: [], categories: [], username: "لطفا وارد شوید" });
    }
});


app.get('/filter-products', async (req, res) => {
    const { category, subcategory } = req.query;
    try {
        const query = {};
        if (category) query.category = category;
        if (subcategory) query.subcategory = subcategory;
        
        const products = await Product.find(query);
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'خطا در دریافت محصولات' });
    }
});

app.get('/search-products', async (req, res) => {
    const { query } = req.query;
    try {
        const products = await Product.find({
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } }
            ]
        });
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'خطا در جستجوی محصولات' });
    }
});

app.get('/admin', isAuthenticated, async (req, res) => {
    if (req.session.user.type !== 'admin') {
        return res.redirect('/login');
    }
    try {
        const categories = await Category.find();
        const products = await Product.find();
        res.render('admin', { categories, products });
    } catch (error) {
        res.redirect('/login');
    }
});


app.post('/admin/product', upload.single('image'), async (req, res) => {
    try {
        const product = new Product({
            name: req.body.name,
            category: req.body.category,
            subcategory: req.body.subcategory,
            price: req.body.price,
            description: req.body.description,
            image: req.file ? `/uploads/${req.file.filename}` : ''
        });
        await product.save();
        res.redirect('/admin');
    } catch (error) {
        res.redirect('/admin');
    }
});

app.get('/admin/product/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: 'خطا در دریافت اطلاعات محصول' });
    }
});

app.post('/admin/product/:id', upload.single('image'), async (req, res) => {
    try {
        const updateData = {
            name: req.body.name,
            category: req.body.category,
            subcategory: req.body.subcategory,
            price: req.body.price,
            description: req.body.description
        };
        if (req.file) {
            updateData.image = `/uploads/${req.file.filename}`;
        }
        await Product.findByIdAndUpdate(req.params.id, updateData);
        res.redirect('/admin');
    } catch (error) {
        res.redirect('/admin');
    }
});

app.delete('/admin/product/:id', async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطا در حذف محصول' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});


function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: Images Only!');
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});