const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri =
  "mongodb+srv://shihabkhanahab_db_user:uQP90nYtqhBjLwy1@cluster0.dv2qqne.mongodb.net/?appName=Cluster0";
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("Movie-data");
    const movieCollection = db.collection("movie");
    //find
    //findone
    app.get("/movie", async(req, res) => {

     const result = await  movieCollection.find().toArray()
       
      res.send(result);
    });
   //post
   //insertone
   //insertmany
    app.post("/movie",async(req,res)=>
{         const data = req.body
     console.log(data)
     const result = movieCollection.insertMany()
})


    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //     await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("my movies information coming soon toon");
});

app.get("/movies", (req, res) => {
  res.send(movies);
});

app.get("/movies/:id", (req, res) => {
  const id = parseInt(req.params.id);
  console.log("i need data for id:", id);
  const movie = movies.find((movie) => movie.id === id) || {};
  res.send(movie);
});

app.listen(port, () => {
  console.log(`my movies server is running on : ${port}`);
});
