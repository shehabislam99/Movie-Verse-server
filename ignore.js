const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Firebase Admin
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Firebase Authentication Middleware
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// Check if user is movie owner
const checkMovieOwner = async (req, res, next) => {
  try {
    const movieId = req.params.id;
    const userEmail = req.user.email;

    const movie = await moviesCollection.findOne({
      _id: new ObjectId(movieId),
    });

    if (!movie) {
      return res.status(404).json({ message: "Movie not found" });
    }

    if (movie.addedBy !== userEmail) {
      return res
        .status(403)
        .json({ message: "Not authorized to modify this movie" });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

let moviesCollection, usersCollection, watchlistCollection, reviewsCollection;

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB successfully!");

    const database = client.db("movieMasterDB");
    moviesCollection = database.collection("movies");
    usersCollection = database.collection("users");
    watchlistCollection = database.collection("watchlist");
    reviewsCollection = database.collection("reviews");

    // Create indexes for better performance
    await moviesCollection.createIndex({ genre: 1 });
    await moviesCollection.createIndex({ rating: -1 });
    await moviesCollection.createIndex({ addedBy: 1 });
    await watchlistCollection.createIndex(
      { userId: 1, movieId: 1 },
      { unique: true }
    );

    // Basic route
    app.get("/", (req, res) => {
      res.send("MovieMaster Pro Server is running");
    });

    // ========== AUTHENTICATION ROUTES ==========
    app.post("/users", verifyToken, async (req, res) => {
      try {
        const { name, email, photoURL } = req.body;
        const user = {
          uid: req.user.uid,
          name,
          email,
          photoURL,
          createdAt: new Date(),
          lastLogin: new Date(),
        };

        const existingUser = await usersCollection.findOne({ uid: user.uid });

        if (existingUser) {
          // Update last login
          await usersCollection.updateOne(
            { uid: user.uid },
            { $set: { lastLogin: new Date() } }
          );
          return res.status(200).json({
            message: "User logged in successfully",
            user: existingUser,
          });
        }

        const result = await usersCollection.insertOne(user);
        res.status(201).json({
          message: "User created successfully",
          user: { ...user, _id: result.insertedId },
        });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error creating user", error: error.message });
      }
    });

    // ========== STATISTICS ROUTES ==========
    app.get("/stats", async (req, res) => {
      try {
        const totalMovies = await moviesCollection.countDocuments();
        const totalUsers = await usersCollection.countDocuments();

        res.json({ totalMovies, totalUsers });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching statistics", error: error.message });
      }
    });

    // ========== MOVIE CRUD ROUTES ==========

    // Get all movies with filtering and pagination
    app.get("/movies", async (req, res) => {
      try {
        const {
          page = 1,
          limit = 12,
          genre,
          minRating,
          maxRating,
          search,
          sortBy = "addedDate",
          sortOrder = "desc",
        } = req.query;

        let query = {};

        // Genre filter
        if (genre) {
          const genres = genre.split(",");
          query.genre = { $in: genres };
        }

        // Rating range filter
        if (minRating || maxRating) {
          query.rating = {};
          if (minRating) query.rating.$gte = parseFloat(minRating);
          if (maxRating) query.rating.$lte = parseFloat(maxRating);
        }

        // Search filter
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { director: { $regex: search, $options: "i" } },
            { cast: { $regex: search, $options: "i" } },
          ];
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const movies = await moviesCollection
          .find(query)
          .sort(sortOptions)
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        const total = await moviesCollection.countDocuments(query);

        res.json({
          movies,
          totalPages: Math.ceil(total / parseInt(limit)),
          currentPage: parseInt(page),
          total,
        });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching movies", error: error.message });
      }
    });

    // Get featured movies for carousel
    app.get("/movies/featured", async (req, res) => {
      try {
        const featuredMovies = await moviesCollection
          .find({ featured: true })
          .limit(5)
          .toArray();
        res.json(featuredMovies);
      } catch (error) {
        res.status(500).json({
          message: "Error fetching featured movies",
          error: error.message,
        });
      }
    });

    // Get top rated movies
    app.get("/movies/top-rated", async (req, res) => {
      try {
        const topRated = await moviesCollection
          .find({ rating: { $gte: 8 } })
          .sort({ rating: -1 })
          .limit(5)
          .toArray();
        res.json(topRated);
      } catch (error) {
        res.status(500).json({
          message: "Error fetching top rated movies",
          error: error.message,
        });
      }
    });

    // Get recently added movies
    app.get("/movies/recent", async (req, res) => {
      try {
        const recentMovies = await moviesCollection
          .find()
          .sort({ addedDate: -1 })
          .limit(6)
          .toArray();
        res.json(recentMovies);
      } catch (error) {
        res.status(500).json({
          message: "Error fetching recent movies",
          error: error.message,
        });
      }
    });

    // Get movie by ID
    app.get("/movies/:id", async (req, res) => {
      try {
        const movie = await moviesCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!movie) {
          return res.status(404).json({ message: "Movie not found" });
        }
        res.json(movie);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching movie", error: error.message });
      }
    });

    // Add new movie (Protected)
    app.post("/movies", verifyToken, async (req, res) => {
      try {
        const movie = {
          ...req.body,
          addedBy: req.user.email,
          addedDate: new Date(),
          reviews: [],
          averageRating: 0,
        };

        // Validate required fields
        const requiredFields = [
          "title",
          "genre",
          "releaseYear",
          "director",
          "rating",
          "plotSummary",
          "posterUrl",
        ];
        for (const field of requiredFields) {
          if (!movie[field]) {
            return res
              .status(400)
              .json({ message: `Missing required field: ${field}` });
          }
        }

        const result = await moviesCollection.insertOne(movie);
        res.status(201).json({
          message: "Movie added successfully",
          movieId: result.insertedId,
        });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error adding movie", error: error.message });
      }
    });

    // Update movie (Protected + Owner only)
    app.patch("/movies/:id", verifyToken, checkMovieOwner, async (req, res) => {
      try {
        const updateData = { ...req.body };
        delete updateData.addedBy; // Prevent changing the owner

        const result = await moviesCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Movie not found" });
        }

        res.json({ message: "Movie updated successfully" });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error updating movie", error: error.message });
      }
    });

    // Delete movie (Protected + Owner only)
    app.delete(
      "/movies/:id",
      verifyToken,
      checkMovieOwner,
      async (req, res) => {
        try {
          const result = await moviesCollection.deleteOne({
            _id: new ObjectId(req.params.id),
          });

          if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Movie not found" });
          }

          // Also remove from all watchlists and reviews
          await watchlistCollection.deleteMany({ movieId: req.params.id });
          await reviewsCollection.deleteMany({ movieId: req.params.id });

          res.json({ message: "Movie deleted successfully" });
        } catch (error) {
          res
            .status(500)
            .json({ message: "Error deleting movie", error: error.message });
        }
      }
    );

    // Get user's collection (Protected)
    app.get("/movies/my-collection", verifyToken, async (req, res) => {
      try {
        const userMovies = await moviesCollection
          .find({ addedBy: req.user.email })
          .sort({ addedDate: -1 })
          .toArray();
        res.json(userMovies);
      } catch (error) {
        res.status(500).json({
          message: "Error fetching user movies",
          error: error.message,
        });
      }
    });

    // ========== WATCHLIST ROUTES ==========

    // Add to watchlist (Protected)
    app.post("/watchlist/:movieId", verifyToken, async (req, res) => {
      try {
        const watchlistItem = {
          userId: req.user.uid,
          movieId: req.params.movieId,
          addedAt: new Date(),
        };

        const existingItem = await watchlistCollection.findOne({
          userId: req.user.uid,
          movieId: req.params.movieId,
        });

        if (existingItem) {
          return res
            .status(400)
            .json({ message: "Movie already in watchlist" });
        }

        await watchlistCollection.insertOne(watchlistItem);
        res.status(201).json({ message: "Movie added to watchlist" });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error adding to watchlist", error: error.message });
      }
    });

    // Get user's watchlist (Protected)
    app.get("/watchlist", verifyToken, async (req, res) => {
      try {
        const watchlistItems = await watchlistCollection
          .find({ userId: req.user.uid })
          .toArray();

        const movieIds = watchlistItems.map(
          (item) => new ObjectId(item.movieId)
        );
        const movies = await moviesCollection
          .find({ _id: { $in: movieIds } })
          .toArray();

        res.json(movies);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching watchlist", error: error.message });
      }
    });

    // Remove from watchlist (Protected)
    app.delete("/watchlist/:movieId", verifyToken, async (req, res) => {
      try {
        const result = await watchlistCollection.deleteOne({
          userId: req.user.uid,
          movieId: req.params.movieId,
        });

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .json({ message: "Movie not found in watchlist" });
        }

        res.json({ message: "Movie removed from watchlist" });
      } catch (error) {
        res.status(500).json({
          message: "Error removing from watchlist",
          error: error.message,
        });
      }
    });

    // ========== REVIEWS ROUTES ==========

    // Add review (Protected)
    app.post("/movies/:id/reviews", verifyToken, async (req, res) => {
      try {
        const review = {
          movieId: req.params.id,
          userId: req.user.uid,
          userEmail: req.user.email,
          userName: req.user.name || "Anonymous",
          rating: req.body.rating,
          comment: req.body.comment,
          createdAt: new Date(),
        };

        // Validate rating
        if (review.rating < 1 || review.rating > 5) {
          return res
            .status(400)
            .json({ message: "Rating must be between 1 and 5" });
        }

        // Check if user already reviewed this movie
        const existingReview = await reviewsCollection.findOne({
          movieId: req.params.id,
          userId: req.user.uid,
        });

        if (existingReview) {
          return res
            .status(400)
            .json({ message: "You have already reviewed this movie" });
        }

        await reviewsCollection.insertOne(review);

        // Update movie's average rating
        await updateMovieRating(req.params.id);

        res.status(201).json({ message: "Review added successfully" });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error adding review", error: error.message });
      }
    });

    // Get reviews for a movie
    app.get("/movies/:id/reviews", async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .find({ movieId: req.params.id })
          .sort({ createdAt: -1 })
          .toArray();
        res.json(reviews);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching reviews", error: error.message });
      }
    });

    // ========== GENRES ROUTE ==========
    app.get("/genres", async (req, res) => {
      try {
        const genres = await moviesCollection.distinct("genre");
        res.json(genres);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching genres", error: error.message });
      }
    });

    console.log("All routes initialized successfully!");
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }
}

// Helper function to update movie rating
async function updateMovieRating(movieId) {
  try {
    const reviews = await reviewsCollection.find({ movieId }).toArray();

    if (reviews.length === 0) return;

    const averageRating =
      reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;

    await moviesCollection.updateOne(
      { _id: new ObjectId(movieId) },
      { $set: { averageRating: parseFloat(averageRating.toFixed(1)) } }
    );
  } catch (error) {
    console.error("Error updating movie rating:", error);
  }
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error(error);
  res
    .status(500)
    .json({ message: "Something went wrong!", error: error.message });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});

run().catch(console.dir);

app.listen(port, () => {
  console.log(`MovieMaster Pro server is running on port ${port}`);
});





import React from "react";
import { Link } from "react-router-dom";
import DropDownUser from "./DropDownUser";
import MoblieMenu from "./MoblieMenu";

import { useTheme } from "../../Auth/useTheme";
import { useAuth } from "../../Auth/useAuth";

const Header = () => {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="bg-white dark:bg-gray-800 shadow-md">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link
          to="/"
          className="text-2xl font-bold text-gray-800 dark:text-white"
        >
          MoviePoka Pro
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center space-x-6">
          <Link
            to="/"
            className="text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white"
          >
            Home
          </Link>
          <Link
            to="/movies"
            className="text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white"
          >
            All Movies
          </Link>
          {user && (
            <Link
              to="/my-collection"
              className="text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white"
            >
              My Collection
            </Link>
          )}
        </nav>

        <div className="flex items-center space-x-4">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white"
          >
            {isDark ? "Light" : "Dark"}
          </button>

          {/* User Authentication */}
          {user ? (
            <DropDownUser user={user} />
          ) : (
            <div className="hidden md:flex space-x-2">
              <Link
                to="/login"
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
      <MoblieMenu />
    </header>
  );
};

export default Header;
