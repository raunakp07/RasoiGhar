let bookings = JSON.parse(localStorage.getItem("bookings")) || [];

function createBooking() {
  const booking = {
    restaurant: restaurant.value,
    date: date.value,
    time: time.value,
    guests: guests.value
  };

  bookings.push(booking);
  localStorage.setItem("bookings", JSON.stringify(bookings));
  alert("Booking Created!");
  location.reload();
}

function renderBookings() {
  const list = document.getElementById("bookingList");
  list.innerHTML = "";

  if (bookings.length === 0) {
    list.innerHTML = `
      <div class="card">
        <h3>No Bookings Found</h3>
        <p>Create your first booking to see it here.</p>
      </div>`;
    return;
  }

  bookings.forEach((b, i) => {
    list.innerHTML += `
      <div class="card">
        <h3>${b.restaurant}</h3>
        <p>Date: ${b.date}</p>
        <p>Time: ${b.time}</p>
        <p>Guests: ${b.guests}</p>
        <button onclick="deleteBooking(${i})">Cancel</button>
      </div>`;
  });
}

function deleteBooking(index) {
  bookings.splice(index, 1);
  localStorage.setItem("bookings", JSON.stringify(bookings));
  renderBookings();
}

renderBookings();
