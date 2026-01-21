
INSERT INTO restaurants (id, name) VALUES
('11111111-1111-1111-1111-111111111111', 'Le Chateau');

INSERT INTO locations (id, restaurant_id, name) VALUES
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Main Dining Room');

INSERT INTO users (id, restaurant_id, email, name, role) VALUES
('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'manager@lechateau.com', 'Alice Manager', 'MANAGER');
