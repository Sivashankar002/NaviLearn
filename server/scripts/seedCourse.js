const mongoose = require('mongoose');
const Course = require('../models/Course');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const sampleCourse = {
  title: "Mastering Data Structures & Algorithms",
  description: "Learn Stacks, Queues, Linked Lists, Trees, Tries, and Graphs step-by-step with real-time visual path customization.",
  masteryThreshold: 70,
  modules: [
    {
      title: "1. Stacks",
      description: "Learn the Last-In, First-Out (LIFO) principle and stack implementations.",
      contentUrl: "https://www.youtube.com/embed/t2CEgPsws3U?start=21",
      contentText: "A stack is a linear data structure that follows the LIFO (Last In First Out) principle. This means the last element added to the stack will be the first one to be removed. Standard operations include push (insert), pop (remove), and peek (look at the top element without removing it).",
      duration: 20,
      difficulty: "Beginner"
    },
    {
      title: "2. Queues & Priority Queues",
      description: "Master the First-In, First-Out (FIFO) principle and priority queuing.",
      contentUrl: "https://www.youtube.com/embed/t2CEgPsws3U?start=1164",
      contentText: "A queue is a linear structure that follows the FIFO (First In First Out) principle, similar to a line at a store. In a Priority Queue, elements are inserted with a priority rating, and elements with higher priorities are dequeued before elements with lower priorities.",
      duration: 25,
      difficulty: "Beginner"
    },
    {
      title: "3. Binary Search Tree Basics",
      description: "Learn parent/child node relationships, BST properties, and traversals.",
      contentUrl: "https://www.youtube.com/embed/t2CEgPsws3U?start=1563",
      contentText: "A Binary Search Tree (BST) is a node-based binary tree data structure where each node has at most two children. The left subtree of a node contains only nodes with keys lesser than the node's key, and the right subtree contains only nodes with keys greater than the node's key.",
      duration: 35,
      difficulty: "Intermediate"
    },
    {
      title: "4. Linked Lists",
      description: "Understand nodes, pointers, and reference-based linear lists.",
      contentUrl: "https://www.youtube.com/embed/t2CEgPsws3U?start=3784",
      contentText: "A Linked List is a linear data structure where elements are not stored at contiguous memory locations. Instead, elements are linked using pointers. Each node contains a data field and a reference (link) to the next node in the sequence.",
      duration: 30,
      difficulty: "Intermediate"
    },
    {
      title: "5. Tries",
      description: "Master prefix trees optimized for fast retrieval and auto-suggestions.",
      contentUrl: "https://www.youtube.com/embed/t2CEgPsws3U?start=4499",
      contentText: "A Trie (or prefix tree) is an ordered tree data structure used to store a dynamic set or associative array where the keys are usually strings. It is highly optimized for fast prefix search operations, auto-complete utilities, and spelling checks.",
      duration: 40,
      difficulty: "Advanced"
    },
    {
      title: "6. Graphs & Breadth-First Search",
      description: "Learn vertices, edges, adjacency matrices/lists, and BFS traversal.",
      contentUrl: "https://www.youtube.com/embed/t2CEgPsws3U?start=6127",
      contentText: "A Graph is a non-linear data structure consisting of nodes (vertices) and links (edges). Breadth-First Search (BFS) is a graph traversal algorithm that starts at a selected node and explores all of the neighbor nodes at the present depth before moving to nodes at the next depth level.",
      duration: 45,
      difficulty: "Advanced"
    }
  ],
  assessment: [
    {
      question: "Which principle does a Stack follow for insertion and deletion?",
      options: ["FIFO (First-In, First-Out)", "LIFO (Last-In, First-Out)", "LILO (Last-In, Last-Out)", "Random Access"],
      correctAnswer: "LIFO (Last-In, First-Out)",
      skillTag: "Stacks"
    },
    {
      question: "What data structure operates under the First-In, First-Out (FIFO) principle?",
      options: ["Queue", "Stack", "Binary Tree", "Trie"],
      correctAnswer: "Queue",
      skillTag: "Queues"
    },
    {
      question: "In a Binary Search Tree (BST), what is the relationship between child nodes and their parent?",
      options: [
        "Left child is larger, Right child is smaller than the parent",
        "Left child is smaller, Right child is larger than the parent",
        "Both children must be equal to the parent",
        "There is no relational rule"
      ],
      correctAnswer: "Left child is smaller, Right child is larger than the parent",
      skillTag: "Trees"
    },
    {
      question: "Which of the following is true about accessing an element in a Singly Linked List?",
      options: [
        "It is O(1) random access",
        "It requires O(n) sequential traversal starting from the Head node",
        "It is O(log n) binary search",
        "It is constant time regardless of list size"
      ],
      correctAnswer: "It requires O(n) sequential traversal starting from the Head node",
      skillTag: "Linked Lists"
    },
    {
      question: "Which data structure is optimized for searching prefixes of strings?",
      options: ["Queue", "Stack", "Trie", "Linked List"],
      correctAnswer: "Trie",
      skillTag: "Tries"
    },
    {
      question: "Which graph traversal algorithm uses a queue to visit nodes level-by-level?",
      options: ["Breadth-First Search (BFS)", "Depth-First Search (DFS)", "In-order Traversal", "Dijkstra's Algorithm"],
      correctAnswer: "Breadth-First Search (BFS)",
      skillTag: "Graphs"
    }
  ]
};

const seedCourse = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database for course seeding...');

    // Remove existing course with the same name to prevent duplicates
    await Course.deleteMany({ title: sampleCourse.title });

    const course = new Course(sampleCourse);
    await course.save();

    console.log('Course "Mastering Data Structures & Algorithms" seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Course seeding failed:', error);
    process.exit(1);
  }
};

seedCourse();
