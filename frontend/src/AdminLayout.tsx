//import React from "react";
import { Outlet } from "react-router-dom";

const AdminLayout = () => {
  return (
    <div className="flex">
      {/* Sidebar */}
      <aside
        id="sidebar"
      >
       <a href="#" id="brand">
			<i id='bx bxs-smile'></i>
			<span id="text">AdminHub</span>
		</a>
		<ul id="side-menu top">
			<li id="active">
				<a href="#">
					<i id='bx bxs-dashboard' ></i>
					<span id="text">Dashboard</span>
				</a>
			</li>
			<li>
				<a href="#">
					<i id='bx bxs-shopping-bag-alt' ></i>
					<span id="text">My Store</span>
				</a>
			</li>
			<li>
				<a href="#">
					<i id='bx bxs-doughnut-chart' ></i>
					<span id="text">Analytics</span>
				</a>
			</li>
			<li>
				<a href="#">
					<i id='bx bxs-message-dots' ></i>
					<span id="text">Message</span>
				</a>
			</li>
			<li>
				<a href="#">
					<i id='bx bxs-group' ></i>
					<span id="text">Team</span>
				</a>
			</li>
		</ul>
		<ul id="side-menu">
			<li>
				<a href="#">
					<i id='bx bxs-cog' ></i>
					<span id="text">Settings</span>
				</a>
			</li>
			<li>
				<a href="#" id="logout">
					<i id='bx bxs-log-out-circle' ></i>
					<span id="text">Logout</span>
				</a>
			</li>
		</ul>
      </aside>

      {/* Content Area */}
      <div id='content'>
        {/* Navbar */}
        <nav>
			<i id='bx bx-menu' ></i>
			<a href="#" id="nav-link">Categories</a>
			
		</nav>

        {/* Main Content */}
        <main >
          <Outlet />
        </main>
      </div>
      <script src="script.js"></script>
    </div>
  );
};

export default AdminLayout;
