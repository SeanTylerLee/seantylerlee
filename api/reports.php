<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// File to store reports
$reportsFile = 'reports.json';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Get JSON data from the request
    $input = json_decode(file_get_contents('php://input'), true);
    
    if ($input === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON data']);
        exit;
    }
    
    // Add timestamp if not provided
    if (!isset($input['timestamp'])) {
        $input['timestamp'] = date('c');
    }
    
    // Add unique ID
    $input['id'] = 'RPT-' . str_pad(rand(1, 999), 3, '0', STR_PAD_LEFT);
    $input['status'] = 'new';
    
    // Load existing reports
    $reports = [];
    if (file_exists($reportsFile)) {
        $reports = json_decode(file_get_contents($reportsFile), true) ?? [];
    }
    
    // Add new report
    $reports[] = $input;
    
    // Save back to file
    if (file_put_contents($reportsFile, json_encode($reports, JSON_PRETTY_PRINT))) {
        echo json_encode([
            'success' => true,
            'id' => $input['id'],
            'message' => 'Report submitted successfully'
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save report']);
    }
    
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Return all reports
    $reports = [];
    if (file_exists($reportsFile)) {
        $reports = json_decode(file_get_contents($reportsFile), true) ?? [];
    }
    
    echo json_encode($reports);
    
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
?>
