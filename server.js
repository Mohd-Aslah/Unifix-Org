const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const JWT_SECRET = "your_secret_key";

// Database Connections
const adminDB = mongoose.createConnection(
  "mongodb+srv://mohdaslah1010:Unifix123@cluster0.0vbwp.mongodb.net/admins",
  { useNewUrlParser: true, useUnifiedTopology: true }
);

const organizerDB = mongoose.createConnection(
  "mongodb+srv://mohdaslah1010:Unifix123@cluster0.0vbwp.mongodb.net/organizer",
  { useNewUrlParser: true, useUnifiedTopology: true }
);

adminDB.once("open", () => console.log("Connected to Admin Database"));
organizerDB.once("open", () => console.log("Connected to Organizer Database"));

// Schemas
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
}, { collection: "users" });

const Image = adminDB.collection("images");
const User = organizerDB.model("User", UserSchema);

// Middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  });
};

// API Endpoints
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// User Authentication Endpoints
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();
    
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/user', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('username');
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ username: user.username });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Image Management Endpoints (View/Delete only)
app.get("/get-images", authenticate, async (req, res) => {
  try {
    const { college, degree } = req.query;
    let query = {};

    if (college && college !== 'all') query.collegeName = college;
    if (degree && degree !== 'all') query.degreeName = degree;

    // Use `.find(query).toArray()` since we are using a raw collection
    const images = await Image.find(query).toArray();

    // Properly handle cases where data might be missing
    const formattedImages = images.map(image => {
      if (!image.data) {
        console.warn(`Image ${image._id} has no data buffer`);
        return null;
      }

      return {
        _id: image._id,
        filename: image.filename,
        contentType: image.contentType,
        imageBase64: image.data.toString('base64'),
        college: image.collegeName,
        degree: image.degreeName,
        uploadedAt: image.uploadedAt
      };
    }).filter(image => image !== null); // Remove null entries

    res.json(formattedImages);
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ 
      error: "Failed to fetch images",
      details: error.message 
    });
  }
});


// Add this new endpoint to get all distinct colleges and degrees
app.get("/get-filter-options", authenticate, async (req, res) => {
  try {
    const colleges = await Image.distinct("collegeName");
    const degrees = await Image.distinct("degreeName");
    
    res.json({
      colleges: colleges.filter(c => c), // Remove any null/empty values
      degrees: degrees.filter(d => d)    // Remove any null/empty values
    });
  } catch (error) {
    console.error("Error getting filter options:", error);
    res.status(500).json({ 
      error: "Failed to get filter options",
      details: error.message 
    });
  }
});

const { ObjectId } = require("mongodb"); // Import ObjectId

app.delete("/delete-image/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Ensure a valid ObjectId is provided
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid image ID" });
    }

    const result = await Image.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Image not found" });
    }

    res.json({ message: "Image deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete image" });
  }
});


// Start Server
const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});