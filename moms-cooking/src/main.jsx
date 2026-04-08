import { createRoot } from 'react-dom/client'
import './style.css'

const menuItems = [
  { name: "Homemade Lasagna", description: "Layers of pasta, meat sauce, and cheese", price: "$15" },
  { name: "Chicken Pot Pie", description: "Creamy chicken with vegetables in flaky crust", price: "$14" },
  { name: "Beef Stew", description: "Tender beef with potatoes and carrots", price: "$13" },
  { name: "Apple Pie", description: "Fresh apples with cinnamon, served warm", price: "$8" },
  { name: "Chocolate Chip Cookies", description: "Freshly baked, gooey in the middle", price: "$6" },
  { name: "Banana Bread", description: "Moist and flavorful, perfect with coffee", price: "$7" },
]

function App() {
  return (
    <div className="app">
      <nav className="navbar">
        <div className="logo">Mom's Cooking</div>
        <div className="nav-links">
          <a href="#home">Home</a>
          <a href="#menu">Menu</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </div>
      </nav>

      <section id="home" className="hero">
        <div className="hero-content">
          <h1>Homemade with Love</h1>
          <p>Comfort food made the way Mom used to make it</p>
          <a href="#menu" className="cta-button">View Menu</a>
        </div>
      </section>

      <section id="menu" className="menu-section">
        <h2>Our Menu</h2>
        <div className="menu-grid">
          {menuItems.map((item, index) => (
            <div key={index} className="menu-item">
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <span className="price">{item.price}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="about" className="about-section">
        <h2>Our Story</h2>
        <p>
          Welcome to Mom's Cooking! We believe that the best food is made with love 
          and fresh ingredients. Every recipe is passed down through generations, 
          bringing you the warmth of home-cooked meals.
        </p>
        <p>
          Founded with a passion for traditional cooking, we serve dishes that 
          remind you of Sunday dinners at grandma's house.
        </p>
      </section>

      <section id="contact" className="contact-section">
        <h2>Contact Us</h2>
        <p>📍 123 Home Kitchen Lane, Flavor Town</p>
        <p>📞 (555) 123-4567</p>
        <p>✉️ hello@momscooking.com</p>
        <p className="hours">Hours: Mon-Fri 11am-8pm, Sat-Sun 10am-9pm</p>
      </section>

      <footer className="footer">
        <p>&copy; 2026 Mom's Cooking. Made with ❤️</p>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)